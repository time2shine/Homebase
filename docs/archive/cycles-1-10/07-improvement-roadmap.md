# Homebase — Product Improvement Roadmap

> **Author**: Product Architect  
> **Date**: 2026-09-25  
> **Scope**: Actionable, risk-assessed improvement plan grounded in documented project limitations  
> **Prerequisites**: [AGENTS.md](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md), [docs/00-project-baseline.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/00-project-baseline.md), [docs/01-architecture.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/01-architecture.md), [docs/02-feature-map.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/02-feature-map.md), [docs/03-data-architecture.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/03-data-architecture.md), [docs/04-code-review.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/04-code-review.md), [docs/05-security-review.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/05-security-review.md), [docs/06-performance-review.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/06-performance-review.md), [docs/10-testing-strategy.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/10-testing-strategy.md), [docs/11-api-integration-map.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/11-api-integration-map.md)

---

## Guiding Principles

Every item in this roadmap is tied directly to a specific finding from the audit documentation. Generic suggestions (e.g. "improve performance" or "add more features") are excluded. Each recommendation specifies the **exact limitation** it addresses, the files involved, and a realistic risk assessment.

The three phases are ordered by ascending risk:

| Phase | Goal | Risk Profile |
|:---|:---|:---|
| **Phase 1** | Safe improvements — bug fixes, data integrity, security hardening, and additive test coverage | Very Low to Low |
| **Phase 2** | Architecture improvements — monolith decomposition, storage unification, and CSS modularization | Low to Medium |
| **Phase 3** | Advanced features — build-time optimizations, cross-tab coordination, and enhanced user capabilities | Medium to High |

---

## Phase 1: Safe Improvements

These changes are additive, isolated, or fix documented bugs. They do not restructure existing code, rename globals, or alter script load order.

---

### 1.1 Include `myWallpapers` in Backup Export/Import

**Description**: Add the `myWallpapers` storage key to `HOMEBASE_OWNED_STORAGE_KEYS` in `backup-import.js` so that custom user-uploaded wallpaper metadata is included in backup export and properly restored during import.

**User benefit**: Users who upload custom wallpaper images will no longer permanently lose their wallpaper library when exporting settings to migrate between machines or browser profiles. Currently, a backup-and-restore cycle silently destroys all custom wallpapers.

**Technical difficulty**: Very Low — single array entry addition plus import restoration logic for the key.

**Risk**: Very Low. Purely additive to the backup key list. Does not affect any runtime rendering or wallpaper playback code paths. Binary wallpaper blobs in `user-wallpapers-v1` Cache Storage remain out of scope (only metadata is serialized).

**Affected files**:
- [src/newtab/settings/backup-import.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/settings/backup-import.js) (add key to `HOMEBASE_OWNED_STORAGE_KEYS`)

**Dependencies**: None.

**Expected impact**: Eliminates the critical data loss vulnerability documented in [04-code-review.md Issue TD1](file:///c:/Users/Administrator/Desktop/Homebase/docs/04-code-review.md) and [03-data-architecture.md Section 9](file:///c:/Users/Administrator/Desktop/Homebase/docs/03-data-architecture.md).

**Limitation addressed**: Code Review Issue TD1 — Custom wallpapers excluded from backup system (Critical severity).

---

### 1.2 Fix Storage Key Mismatch Between Dashboard and Action Popup

**Description**: Standardize the last-used folder storage key. The dashboard uses `lastUsedBookmarkFolderId` while the action popup uses `homebaseLastUsedFolderId`. Align the action popup to use the dashboard's key.

**User benefit**: When a user saves a bookmark into folder "Work" via the toolbar popup, the new-tab dashboard will open to that same folder on next load. Currently the two surfaces are completely disconnected — the popup writes to one key while the dashboard reads from another.

**Technical difficulty**: Very Low — rename one constant in `action-popup.js`.

**Risk**: Very Low. The action popup is a self-contained IIFE with no shared runtime state. Change is a single constant rename. Requires manual Firefox testing to verify `browser.storage.local` round-trip.

**Affected files**:
- [src/action-popup/action-popup.js](file:///c:/Users/Administrator/Desktop/Homebase/src/action-popup/action-popup.js) (rename `LAST_USED_FOLDER_KEY` from `'homebaseLastUsedFolderId'` to `'lastUsedBookmarkFolderId'`)

**Dependencies**: None.

**Expected impact**: Fixes feature disconnection documented in [04-code-review.md Issue N1](file:///c:/Users/Administrator/Desktop/Homebase/docs/04-code-review.md).

**Limitation addressed**: Code Review Issue N1 — Storage key mismatch between dashboard and action popup (High severity).

---

### 1.3 Remove Unused `cookies` Permission

**Description**: Remove `"cookies"` from the `permissions` array in both Chrome and Firefox manifests.

**User benefit**: Reduces the extension's declared privilege surface. Browser web store reviewers flag unnecessary permissions, and users see fewer scary permission warnings during installation. Removing `cookies` eliminates a theoretical session-hijacking vector if the extension were ever compromised.

**Technical difficulty**: Very Low — delete one line from two JSON files.

**Risk**: Very Low. Verified by `grep -r "browser\.cookies\|chrome\.cookies" src/` returning zero results. No code path exercises this permission.

**Affected files**:
- [manifests/manifest.chrome.json](file:///c:/Users/Administrator/Desktop/Homebase/manifests/manifest.chrome.json#L31) (remove `"cookies"`)
- [manifests/manifest.firefox.json](file:///c:/Users/Administrator/Desktop/Homebase/manifests/manifest.firefox.json#L42) (remove `"cookies"`)

**Dependencies**: None.

**Expected impact**: Eliminates the high-severity finding in [05-security-review.md Finding MS-1](file:///c:/Users/Administrator/Desktop/Homebase/docs/05-security-review.md). Reduces declared attack surface and improves web store review posture.

**Limitation addressed**: Security Review Finding MS-1 — Unused `cookies` permission declared (High severity).

---

### 1.4 Add Explicit Content Security Policy to Manifests

**Description**: Add a `content_security_policy.extension_pages` field to both manifests, explicitly restricting `img-src`, `media-src`, and `connect-src` to only the domains actually used by Homebase.

**User benefit**: Defense-in-depth security. Even if a future code change introduces a DOM injection path, the CSP prevents loading resources from unapproved origins. Documents the extension's actual network surface in the manifest itself.

**Technical difficulty**: Low — add a JSON key to both manifests. Requires careful enumeration of all used domains (already catalogued in [11-api-integration-map.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/11-api-integration-map.md)).

**Risk**: Low. If a domain is accidentally omitted from the CSP, that specific integration (e.g. a search suggestion API or RSS feed) will fail with a console CSP violation. Mitigation: test all 7 suggestion APIs and all RSS feeds after applying.

**Affected files**:
- [manifests/manifest.chrome.json](file:///c:/Users/Administrator/Desktop/Homebase/manifests/manifest.chrome.json)
- [manifests/manifest.firefox.json](file:///c:/Users/Administrator/Desktop/Homebase/manifests/manifest.firefox.json)

**Dependencies**: Requires complete domain inventory from [docs/11-api-integration-map.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/11-api-integration-map.md).

**Expected impact**: Addresses [05-security-review.md Finding MS-3](file:///c:/Users/Administrator/Desktop/Homebase/docs/05-security-review.md). Promotes extension from implicit browser-default CSP to explicit, auditable policy.

**Limitation addressed**: Security Review Finding MS-3 — No explicit Content Security Policy (Medium severity).

---

### 1.5 Add News Feed Fetch Timeout

**Description**: Add a strict 7-second timeout to the news widget's `fetch()` call using `AbortSignal.timeout(7000)`, matching the pattern already established by the weather widget.

**User benefit**: Prevents the news widget from displaying an infinite loading spinner when an RSS feed server hangs. Users will see cached news or an error state instead of an unresponsive widget.

**Technical difficulty**: Very Low — add `signal` option to one `fetch()` call, following the existing `weather.js` pattern.

**Risk**: Very Low. Isolated to the news widget. The `AbortController` infrastructure already exists in `news.js`. Adding a timeout is purely additive.

**Affected files**:
- [src/newtab/widgets/news.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/news.js#L508-L516)

**Dependencies**: None.

**Expected impact**: Fixes [06-performance-review.md Issue N1](file:///c:/Users/Administrator/Desktop/Homebase/docs/06-performance-review.md) and [04-code-review.md Issue E3](file:///c:/Users/Administrator/Desktop/Homebase/docs/04-code-review.md). Prevents indefinite socket hangs and perpetual loading states.

**Limitation addressed**: Performance Review Issue N1 — News feed fetch has no network timeout mechanism (High severity).

---

### 1.6 Fix Favicon Object URL Memory Leak

**Description**: Add `URL.revokeObjectURL(objectUrl)` in a `try...finally` block around `testFaviconCandidateObjectUrl()` in `resolveFaviconCandidate()`.

**User benefit**: Eliminates a permanent memory leak where every tested favicon candidate blob persists in browser memory for the lifetime of the tab. Users with large bookmark folders (50+ items) will see reduced memory consumption per tab.

**Technical difficulty**: Very Low — wrap existing code in `try...finally`, add one `URL.revokeObjectURL()` call.

**Risk**: Very Low. The revocation occurs after the candidate has been tested and (if accepted) already written to Cache Storage. The object URL is no longer needed after this point.

**Affected files**:
- [src/new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js#L4739-L4756) (`resolveFaviconCandidate` function)

**Dependencies**: None.

**Expected impact**: Eliminates memory leak documented in [06-performance-review.md Issue M1](file:///c:/Users/Administrator/Desktop/Homebase/docs/06-performance-review.md). Saves megabytes of uncollected image memory per tab.

**Limitation addressed**: Performance Review Issue M1 — Leaked favicon object URLs in `resolveFaviconCandidate` (High severity).

---

### 1.7 Fix Dynamic Accent Color 33 MB Memory Spike

**Description**: In `extractAverageColor()`, draw the wallpaper poster image into a 1×1 pixel canvas instead of allocating a full-resolution `getImageData()` buffer.

**User benefit**: Eliminates a 30–60 MB transient memory spike and 20–50ms main-thread garbage collection freeze during startup. Users on lower-RAM devices will experience smoother tab opens.

**Technical difficulty**: Very Low — change `canvas.width`/`canvas.height` to 1, adjust `drawImage` to scale down, read 4 bytes instead of millions.

**Risk**: Very Low. The function's only purpose is computing an average color. Drawing to 1×1 computes the same result via the browser's native bilinear downsampler but with 4 bytes instead of 33 MB.

**Affected files**:
- [src/newtab/wallpaper/dynamic-accent.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/wallpaper/dynamic-accent.js#L17-L27)

**Dependencies**: None.

**Expected impact**: Reduces heap allocation from 33 MB to 4 bytes as documented in [06-performance-review.md Issue M2](file:///c:/Users/Administrator/Desktop/Homebase/docs/06-performance-review.md).

**Limitation addressed**: Performance Review Issue M2 — Excessive memory allocation in dynamic accent color extraction (High severity).

---

### 1.8 Add Automated Unit Tests for Pure Utility Functions

**Description**: Create a test suite using Node.js built-in `node:test` and `node:assert` (zero npm dependencies) covering `evaluateMath()`, `evaluateUnits()`, `isLikelyUrl()`, `normalizeWidgetOrder()`, `getLocalDayStamp()`, and backup envelope validation.

**User benefit**: Prevents silent regressions in the math calculator, URL detection, unit conversion, and backup system — all user-facing features that currently have 0% test coverage. Developers can refactor with confidence.

**Technical difficulty**: Low — tests target pure functions with no DOM or browser API dependencies. Requires extracting testable function signatures or evaluating them via `vm` module.

**Risk**: Very Low. Tests are new files only; no source code is modified. Add `"test": "node --test tests/*.test.mjs"` to `package.json`.

**Affected files**:
- [package.json](file:///c:/Users/Administrator/Desktop/Homebase/package.json) (add `"test"` script)
- New: `tests/search-utils.test.mjs`
- New: `tests/widget-order.test.mjs`
- New: `tests/date-utils.test.mjs`
- New: `tests/backup-validation.test.mjs`

**Dependencies**: Node.js ≥ 20 (for `node:test` built-in).

**Expected impact**: Addresses [04-code-review.md Issue T1](file:///c:/Users/Administrator/Desktop/Homebase/docs/04-code-review.md) (Critical severity — 0% unit test coverage) and [10-testing-strategy.md Phase 1](file:///c:/Users/Administrator/Desktop/Homebase/docs/10-testing-strategy.md).

**Limitation addressed**: Code Review Issue T1 — Zero unit test suite, 0% test coverage (Critical severity).

---

### 1.9 Add Storage Backup Round-Trip Verification Test

**Description**: Create an automated test that populates all 76 documented `HOMEBASE_OWNED_STORAGE_KEYS` with representative dummy data, executes the export path, clears storage, executes the import path, and asserts every key was faithfully restored.

**User benefit**: Prevents future backup regressions where newly added storage keys are forgotten in the key registry. Users can trust that backup/restore is lossless.

**Technical difficulty**: Low — test operates on pure data structures. Requires mock of `browser.storage.local` (simple in-memory Map).

**Risk**: Very Low. New test file only; no source modifications.

**Affected files**:
- New: `tests/backup-roundtrip.test.mjs`

**Dependencies**: Item 1.8 (test infrastructure).

**Expected impact**: Addresses [04-code-review.md Issue T3](file:///c:/Users/Administrator/Desktop/Homebase/docs/04-code-review.md) and catches omissions like the `myWallpapers` gap documented in Issue TD1.

**Limitation addressed**: Code Review Issue T3 — No automated storage backup & restore round-trip verification (High severity).

---

### 1.10 Deduplicate `normalizeWidgetOrder` Across Three Files

**Description**: Consolidate the three identical copies of `normalizeWidgetOrder()` (in `preload.js`, `widget-visibility.js`, and `settings-preferences.js`) into a single definition in `src/newtab/core/utils.js`, and have all call sites reference the shared global.

**User benefit**: When a 5th widget (e.g. calendar, stocks) is introduced, updating one file ensures consistency. Currently, updating only one or two copies causes the third to silently strip the new widget during startup normalization.

**Technical difficulty**: Low — move function to `utils.js` (loaded before all three consumers), remove duplicates.

**Risk**: Low. Requires verifying script load order: `utils.js` loads before `preload.js` reads from `localStorage` (synchronous in `<head>`). The `preload.js` copy must remain inline because `utils.js` loads as a deferred body script. **Revised approach**: keep the `preload.js` copy inline (it runs in `<head>` before deferred scripts) but consolidate the `widget-visibility.js` and `settings-preferences.js` copies into `utils.js`.

**Affected files**:
- [src/newtab/core/utils.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/core/utils.js) (add shared `normalizeWidgetOrder`)
- [src/newtab/widgets/widget-visibility.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/widget-visibility.js#L53-L73) (remove duplicate, call `normalizeWidgetOrder` from utils)
- [src/newtab/settings/settings-preferences.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/settings/settings-preferences.js#L485-L505) (remove duplicate, call `normalizeWidgetOrder` from utils)

**Dependencies**: `utils.js` must load before `widget-visibility.js` and `settings-preferences.js` in `new-tab.html` script order (already satisfied by current load order).

**Expected impact**: Addresses [04-code-review.md Issue D1](file:///c:/Users/Administrator/Desktop/Homebase/docs/04-code-review.md) — duplicate widget order normalization (High severity).

**Limitation addressed**: Code Review Issue D1 — Duplicate widget order normalization across three files.

---

### 1.11 Skip Hidden Widget Setup in Startup Idle Queue

**Description**: Guard widget setup tasks in `scheduleStartupHydrationTasks()` with their respective visibility preferences (`appShowWeatherPreference`, `appShowNewsPreference`, `appShowQuotePreference`, `appShowTodoPreference`). If a widget is toggled off, skip its setup task entirely.

**User benefit**: Users who disable widgets they don't use (e.g. news, quotes) get faster tab opens because the idle scheduler skips parsing `quotes.json`, building unused widget state, and attaching dormant DOM listeners.

**Technical difficulty**: Low — add conditional checks before `scheduleIdleTask()` calls.

**Risk**: Low. Each widget already has independent toggle logic. Skipping setup when hidden matches user intent. Must verify that re-enabling a widget via settings still triggers setup (handled by `storage.onChanged` listener).

**Affected files**:
- [src/new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js#L11578-L11670) (`scheduleStartupHydrationTasks`)

**Dependencies**: None.

**Expected impact**: Addresses [06-performance-review.md Issue S4](file:///c:/Users/Administrator/Desktop/Homebase/docs/06-performance-review.md). Frees idle budget for genuinely useful tasks like daily wallpaper rotation.

**Limitation addressed**: Performance Review Issue S4 — Eager widget setup in startup idle queue despite hidden preferences (Medium severity).

---

### 1.12 Persist Favicon Negative Cache Across Tabs

**Description**: Persist failed favicon domain timestamps in `browser.storage.local` (e.g. compact `failedFavicons` map with 7-day TTL) so that new tabs don't re-attempt guaranteed-to-fail network requests for dead domains.

**User benefit**: Users with bookmarks pointing to intranet, expired, or broken domains will see faster tab opens and fewer failed network requests. Currently, every new tab re-dispatches fetch attempts for domains that consistently return 404.

**Technical difficulty**: Low — persist the in-memory `faviconNegativeCache` Map to storage on update, hydrate on startup.

**Risk**: Low. If the TTL is too aggressive, users who fix a broken bookmark won't see the favicon update immediately. Mitigation: use 7-day TTL and clear negative cache on manual bookmark edit.

**Affected files**:
- [src/new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js#L4770) (favicon negative cache)

**Dependencies**: None.

**Expected impact**: Addresses [06-performance-review.md Issue N3](file:///c:/Users/Administrator/Desktop/Homebase/docs/06-performance-review.md). Eliminates repeated 404 network storms on every tab open.

**Limitation addressed**: Performance Review Issue N3 — Favicon in-memory negative cache resets on every new tab (Medium severity).

---

### 1.13 Add Structured Debug Logging to Silent Catch Blocks

**Description**: Replace empty `catch (e) {}` blocks in `preload.js` and `instant_load.js` with guarded console warnings: `if (window.__HB_DEBUG) console.warn('[Module] message:', e);`.

**User benefit**: Developers and advanced users can diagnose startup failures (e.g. `localStorage` blocked by strict privacy settings, `QuotaExceededError`) by setting `window.__HB_DEBUG = true` in the console, instead of facing a completely black-box silent failure.

**Technical difficulty**: Very Low — add logging to existing catch blocks.

**Risk**: Very Low. Debug logging is gated behind a flag that defaults to `undefined` (falsy). Zero runtime cost in production.

**Affected files**:
- [src/preload.js](file:///c:/Users/Administrator/Desktop/Homebase/src/preload.js#L45-L53) (empty catch blocks)
- [src/instant_load.js](file:///c:/Users/Administrator/Desktop/Homebase/src/instant_load.js#L71-L272) (6 empty catch blocks)

**Dependencies**: None.

**Expected impact**: Addresses [04-code-review.md Issue E1](file:///c:/Users/Administrator/Desktop/Homebase/docs/04-code-review.md) — silent error swallowing in synchronous preload & instant load (High severity).

**Limitation addressed**: Code Review Issue E1 — Silent error swallowing in critical initialization paths.

---

## Phase 2: Architecture Improvements

These changes restructure existing code into more maintainable patterns. They require careful extraction following AGENTS.md rules, static verification, and manual browser testing.

---

### 2.1 Extract Search Runtime from `new-tab.js`

**Description**: Move the ~2,200 lines of search system code (`searchEngines[]`, `bangMap`, `setupSearch()`, `handleSearch()`, `handleSearchInput()`, `handleSearchKeydown()`, `executeSearch()`, `cycleSearchEngine()`, `fetchSuggestions()`, `populateSearchOptions()`, `updateSearchUI()`) from `new-tab.js` into `src/newtab/search/search-runtime.js`.

**User benefit**: No direct user-visible change, but reduces the risk of regressions when modifying search behavior. Smaller `new-tab.js` means faster V8 compilation on every tab open (~70 KB less to parse).

**Technical difficulty**: Medium — the search system references several globals from `new-tab.js` (e.g. `allBookmarks`, `activeFolderId`). These cross-references must be identified and bridged via shared globals on `window`.

**Risk**: Medium. Search is listed as a high-risk area in AGENTS.md ("live search input and keyboard behavior", "search suggestions async/cancellation behavior"). Extraction must not alter any function signatures, event handler behavior, or suggestion race guards. Requires Chrome CDP smoke test and manual Firefox testing.

**Affected files**:
- [src/new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) (remove ~2,200 lines)
- New: `src/newtab/search/search-runtime.js`
- [src/new-tab.html](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.html) (add `<script defer>` before `new-tab.js`)
- [scripts/check-newtab-static.mjs](file:///c:/Users/Administrator/Desktop/Homebase/scripts/check-newtab-static.mjs) (update known declarations)

**Dependencies**: `search-utils.js`, `search-suggestion-cache.js`, and `search-history-suggestions.js` must load before `search-runtime.js`.

**Expected impact**: Directly addresses [04-code-review.md Issue L1](file:///c:/Users/Administrator/Desktop/Homebase/docs/04-code-review.md) (Critical — monolithic `new-tab.js`) and [06-performance-review.md Issue F1](file:///c:/Users/Administrator/Desktop/Homebase/docs/06-performance-review.md) (High — 307 KB V8 compilation overhead).

**Limitation addressed**: Code Review Issue L1 — Monolithic `new-tab.js` (Critical severity). Performance Review Issue F1 — 307 KB script straining V8 compilation (High severity).

---

### 2.2 Extract Bookmark Grid Rendering from `new-tab.js`

**Description**: Move bookmark grid rendering and virtualization (~2,800 lines: `renderBookmarkGrid()`, `renderBookmarkTabs()`, `renderSingleBookmarkTile()`, `setupGridSortable()`, virtualization slice logic, staggered animation setup) into `src/newtab/bookmarks/bookmark-grid.js`.

**User benefit**: No direct user-visible change. Isolates the highest-complexity subsystem in the codebase for safer future iteration (e.g. lowering virtualization threshold, improving drag responsiveness).

**Technical difficulty**: High — bookmark rendering is tightly coupled with favicon resolution, context menus, drag-and-drop, and folder picker state. Cross-references to globals like `bookmarkTree`, `activeFolderId`, `gridSortable`, and `bookmarkCustomMetadata` must be carefully preserved.

**Risk**: High. Bookmarks are the highest-risk area in AGENTS.md ("bookmark grid/rendering/tabs", "drag and reorder behavior"). Extraction must be a pure move with zero behavioral changes. Requires CDP harness verification and manual cross-browser testing.

**Affected files**:
- [src/new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js#L3200-L7500) (remove ~2,800 lines)
- New: `src/newtab/bookmarks/bookmark-grid.js`
- [src/new-tab.html](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.html) (add `<script defer>`)
- [scripts/check-newtab-static.mjs](file:///c:/Users/Administrator/Desktop/Homebase/scripts/check-newtab-static.mjs)

**Dependencies**: Must load after `bookmark-style-runtime.js`, `bookmark-tabs-scroll.js`, `grid-reorder-animation.js`, `quick-actions.js`, and `folder-picker.js`. Must load before `new-tab.js`.

**Expected impact**: Reduces `new-tab.js` by another ~2,800 lines (bringing it below 8,000 lines). Directly continues the extraction initiative mandated by AGENTS.md and documented in [04-code-review.md Issue R1](file:///c:/Users/Administrator/Desktop/Homebase/docs/04-code-review.md).

**Limitation addressed**: Code Review Issue R1 — Extract bookmarks subsystem into modular components (High severity). Code Review Issue C1 — Monolithic state machine in `new-tab.js` (High severity).

---

### 2.3 Extract Wallpaper/Video Playback from `new-tab.js`

**Description**: Move wallpaper lifecycle code (~1,500 lines: `applyWallpaperSettings()`, video crossfade logic, `playAndFadeIn()`, dual-video `timeupdate` management, gallery manifest fetching, daily rotation scheduling, Cache API wallpaper storage) into `src/newtab/wallpaper/wallpaper-runtime.js`.

**User benefit**: No direct user-visible change. Isolates video playback and cache management for safer iteration on battery optimization, crossfade timing, and poster caching.

**Technical difficulty**: Medium — wallpaper code has cross-references to startup orchestration and `initializePage()`. The boundary between "startup wallpaper application" (which must stay in `new-tab.js` per AGENTS.md) and "runtime wallpaper management" requires careful delineation.

**Risk**: Medium–High. AGENTS.md lists "wallpaper/video/cache/startup path" as high-risk. Only runtime management functions should move; startup application and `waitForWallpaperReady()` must remain in `new-tab.js`.

**Affected files**:
- [src/new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) (remove ~1,500 lines)
- New: `src/newtab/wallpaper/wallpaper-runtime.js`
- [src/new-tab.html](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.html) (add `<script defer>`)

**Dependencies**: Must load after `dynamic-accent.js`. Must load before `new-tab.js`.

**Expected impact**: Reduces `new-tab.js` by ~1,500 lines. Addresses [06-performance-review.md Issue F1](file:///c:/Users/Administrator/Desktop/Homebase/docs/06-performance-review.md) and [04-code-review.md Issue L1](file:///c:/Users/Administrator/Desktop/Homebase/docs/04-code-review.md).

**Limitation addressed**: Code Review Issue L1 — Monolithic `new-tab.js` (Critical severity).

---

### 2.4 Create Unified Storage Service Abstraction

**Description**: Create `src/newtab/core/storage-service.js` providing a `window.HomebaseStorage` API that wraps `browser.storage.local.get/set/remove` and `localStorage.getItem/setItem` with unified error handling, optional fast-mirror dual-writes, and a mockable interface for unit tests.

**User benefit**: No direct user-visible change. Developers gain a single point of control for all storage operations, enabling consistent error handling, debug logging, and future migration to more efficient storage patterns.

**Technical difficulty**: Medium — define the API surface, then progressively migrate call sites across 15+ files in subsequent PRs.

**Risk**: Low for creating the service. Medium for migrating existing call sites (each migration is small but touches many files). Initial version can coexist with direct calls; migration can be incremental.

**Affected files**:
- New: `src/newtab/core/storage-service.js`
- [src/new-tab.html](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.html) (add `<script defer>` early in load order)
- Incremental: 15+ files across `src/newtab/` (gradual migration)

**Dependencies**: Must load after `utils.js` and before any widget/settings scripts.

**Expected impact**: Addresses [04-code-review.md Issue R2](file:///c:/Users/Administrator/Desktop/Homebase/docs/04-code-review.md) — unified storage service abstraction (High severity). Enables mockable storage for unit tests ([Issue T1](file:///c:/Users/Administrator/Desktop/Homebase/docs/04-code-review.md)).

**Limitation addressed**: Code Review Issue R2 — Scattered direct `browser.storage.local` calls across 15+ files (High severity).

---

### 2.5 Split `new-tab.css` into Modular Stylesheets

**Description**: Decompose the 6,543-line monolithic `new-tab.css` into domain-specific stylesheets:
- `styles/base.css` — CSS custom properties, typography, reset, layout grid (~1,500 lines)
- `styles/dock.css` — navigation dock, Google Apps panel (~400 lines)
- `styles/bookmarks.css` — bookmark grid, tabs, cards, context menus (~1,800 lines)
- `styles/widgets.css` — weather, quote, news, todo sidebar widgets (~1,200 lines)
- Keep existing lazy-loaded `styles/settings.css` and `styles/gallery.css`

Load `base.css` as render-blocking in `<head>`. Load component stylesheets as deferred or via `<link rel="stylesheet" media="all">` in `<body>`.

**User benefit**: Faster First Contentful Paint. Currently, 155 KB of CSS is render-blocking even though ~40% of it styles dialogs and features never shown on initial paint. Splitting allows the browser to paint the wallpaper/clock/bookmarks while lazily loading dialog styles.

**Technical difficulty**: Medium — requires careful identification of CSS rule dependencies, especially `backdrop-filter` cascade and CSS Custom Property inheritance.

**Risk**: Medium. CSS specificity order changes when rules move between files. Requires visual regression testing across Chrome and Firefox to catch layout shifts or styling regressions.

**Affected files**:
- [src/new-tab.css](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.css) (split into multiple files)
- New: `src/styles/base.css`, `src/styles/dock.css`, `src/styles/bookmarks.css`, `src/styles/widgets.css`
- [src/new-tab.html](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.html) (update `<link>` tags)

**Dependencies**: None.

**Expected impact**: Addresses [06-performance-review.md Issue F2](file:///c:/Users/Administrator/Desktop/Homebase/docs/06-performance-review.md) (High — 155 KB render-blocking CSS) and [04-code-review.md Issue L2](file:///c:/Users/Administrator/Desktop/Homebase/docs/04-code-review.md) (High — monolithic stylesheet).

**Limitation addressed**: Performance Review Issue F2 — Render-blocking 155 KB stylesheet (High severity). Code Review Issue L2 — 5,776-line monolithic CSS (High severity).

---

### 2.6 Parallelize Startup Storage Reads

**Description**: In `initializePage()`, move `loadFolderMetadata()` into the initial `Promise.allSettled()` batch alongside `settingsP`, `bookmarkMetaP`, and `lastFolderP`. Consolidate overlapping preference queries between `preload.js` and `initializePage()` into a single unified storage manifest read.

**User benefit**: Faster new tab startup. Eliminates 15–40ms of unnecessary sequential IPC latency on the critical path before bookmarks begin loading.

**Technical difficulty**: Low — `loadFolderMetadata()` has zero data dependency on the other promises. Adding it to the parallel batch is a one-line change.

**Risk**: Low. The function reads `FOLDER_META_KEY` independently. Verify via CDP smoke test that folder metadata is available when `renderBookmarkGrid()` executes.

**Affected files**:
- [src/new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js#L11444-L11476) (`initializePage`)

**Dependencies**: None.

**Expected impact**: Addresses [06-performance-review.md Issue S3](file:///c:/Users/Administrator/Desktop/Homebase/docs/06-performance-review.md) — redundant & sequential storage reads in critical path (High severity).

**Limitation addressed**: Performance Review Issue S3 — Sequential storage reads adding 15–40ms to startup critical path.

---

### 2.7 Add Transactional Backup Import with Rollback

**Description**: Before executing `browser.storage.local.set(updates)` and `browser.storage.local.remove(removals)` during backup import, snapshot the current storage state. If any write operation rejects or the browser process is interrupted, restore the snapshot and notify the user.

**User benefit**: Prevents unrecoverable settings corruption on interrupted backup imports. Currently, if `set()` succeeds but `remove()` rejects, the user is left with a broken hybrid state.

**Technical difficulty**: Medium — requires reading all current keys before overwriting, handling the rollback path, and providing user feedback via the custom alert modal.

**Risk**: Low. The snapshot read is a single `browser.storage.local.get(null)` call before the destructive write. Worst case if the rollback itself fails: user is in the same state as today (no worse).

**Affected files**:
- [src/newtab/settings/backup-import.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/settings/backup-import.js#L174-L180)

**Dependencies**: None.

**Expected impact**: Addresses [04-code-review.md Issue E2](file:///c:/Users/Administrator/Desktop/Homebase/docs/04-code-review.md) — non-transactional storage writes during backup restoration (High severity).

**Limitation addressed**: Code Review Issue E2 — Non-transactional backup import causing potential data corruption.

---

### 2.8 Build Bookmark Node Lookup Map for O(1) Access

**Description**: Construct an `O(1)` lookup `Map` (`bookmarkNodeMap = new Map()`) during the initial `browser.bookmarks.getTree()` load, populated with every node's ID mapping to its object. Replace all calls to the recursive `findBookmarkNodeById()` with direct Map lookups.

**User benefit**: Eliminates 5–15ms of redundant CPU processing during folder navigation and bookmark manipulation, especially for users with large, deeply nested bookmark trees (2,000–10,000 items).

**Technical difficulty**: Low — iterate the tree once during load to build the Map. Replace `findBookmarkNodeById(root, id)` calls with `bookmarkNodeMap.get(id)`.

**Risk**: Low. The Map must be invalidated/rebuilt when bookmarks are created, moved, or deleted. These CRUD operations already trigger tree refreshes, so the Map can be rebuilt alongside.

**Affected files**:
- [src/new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js#L5250-L5280) (`findBookmarkNodeById` and all call sites)

**Dependencies**: None.

**Expected impact**: Addresses [06-performance-review.md Issue O2](file:///c:/Users/Administrator/Desktop/Homebase/docs/06-performance-review.md) — full bookmark tree traversal in `findBookmarkNodeById` (Medium severity). Changes time complexity from O(N) to O(1).

**Limitation addressed**: Performance Review Issue O2 — O(N) recursive tree search for every node lookup.

---

### 2.9 Enforce Favicon Cache LRU Eviction Policy

**Description**: Implement an active LRU limit (max 500 domains) on the `favicons-v1` Cache Storage bucket and the `domainIconMap` storage key. Prune entries whose `lastSeen` timestamp exceeds 30 days during idle time.

**User benefit**: Prevents silent, unbounded disk consumption. Over months of browsing, the favicon cache grows without limit, consuming user disk space and slowing Cache API index lookups. Users will see bounded, predictable storage usage.

**Technical difficulty**: Low–Medium — LRU logic against Cache Storage requires listing all cached keys, sorting by metadata timestamp, and deleting the oldest entries beyond the limit.

**Risk**: Low. Eviction runs during idle time. If a frequently used favicon is pruned, it is re-fetched on next tab open (transparent to the user).

**Affected files**:
- [src/new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js#L2999-L3250) (favicon cache logic)
- [src/new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js#L11520) (`pruneFaviconMetaIfNeeded`)

**Dependencies**: None.

**Expected impact**: Addresses [04-code-review.md Issue TD2](file:///c:/Users/Administrator/Desktop/Homebase/docs/04-code-review.md) — unbounded growth in favicon Cache Storage (High severity) and [06-performance-review.md Issue O1](file:///c:/Users/Administrator/Desktop/Homebase/docs/06-performance-review.md).

**Limitation addressed**: Code Review Issue TD2 — Unbounded favicon cache growth (High severity).

---

## Phase 3: Advanced Features

These changes introduce new capabilities, build-time processing, or cross-tab coordination. They carry higher risk and depend on Phase 1/2 foundations.

---

### 3.1 Build-Time Script Concatenation for Production

**Description**: Extend `scripts/build.mjs` to concatenate the 37 extracted deferred module scripts into 3 logical bundles during `npm run build`:
- `dist/homebase-core.js` — core utils, data, settings, integrations
- `dist/homebase-widgets.js` — weather, news, todo, quote, clock
- `dist/homebase-bookmarks.js` — bookmark grid, tabs, drag, style, favicon

Source `src/` files remain individual scripts for development. Only `dist/` targets use concatenated bundles. Classic `<script defer>` loading is preserved (no ES modules).

**User benefit**: 80–200ms faster tab open time. The browser's JavaScript engine compiles 3 scripts instead of 37, reducing AST parsing, bytecode compilation, and global scope binding overhead on every new tab.

**Technical difficulty**: Medium — the build script must read `new-tab.html`, identify deferred script tags, concatenate their contents in the correct order, and emit the bundled result. Source maps are not required (no bundler tooling).

**Risk**: Medium. Concatenation order must exactly match `<script defer>` tag order. A single ordering mistake causes `ReferenceError` crashes at startup. Mitigation: the existing `check-newtab-static.mjs` validates declaration order and can be adapted to verify bundle correctness.

**Affected files**:
- [scripts/build.mjs](file:///c:/Users/Administrator/Desktop/Homebase/scripts/build.mjs) (add concatenation step)
- New: `scripts/concat-scripts.mjs` (optional separate module)
- `dist/chrome/new-tab.html` and `dist/firefox/new-tab.html` (generated with bundled script tags)

**Dependencies**: Phase 2 extractions (2.1–2.3) should complete first to produce clean, well-separated modules for concatenation.

**Expected impact**: Addresses [06-performance-review.md Issue S1](file:///c:/Users/Administrator/Desktop/Homebase/docs/06-performance-review.md) — 38 unbundled script tags in critical path (High severity). Reduces V8/SpiderMonkey script compilation overhead by 60–80%.

**Limitation addressed**: Performance Review Issue S1 — 38 unbundled scripts adding 80–200ms of startup overhead.

---

### 3.2 Lazy-Load SVG Sprite Sheet and Modal Dialogs

**Description**: Extract the 100 embedded SVG `<symbol>` elements (~160 KB of raw SVG) from `new-tab.html` into an external `assets/icons/sprite.svg` file. Reference symbols via `<svg><use href="assets/icons/sprite.svg#icon-name"></use></svg>`. Move 8 statically embedded dialog DOM structures into `<template>` elements or lazy-load them via `fetch()` when the user opens the respective modal.

**User benefit**: Faster initial page load. The browser no longer parses 1,452 static DOM elements on every tab open. Initial DOM memory drops by 3–8 MB. Users who never open settings dialogs never pay the parsing cost.

**Technical difficulty**: Medium–High — external SVG `<use href>` with cross-document references has browser compatibility nuances (Firefox historically required same-document sprites). Modal lazy-loading requires hooking into every modal open trigger to inject markup on first open.

**Risk**: Medium. Firefox has had inconsistent support for cross-document SVG `<use>` references. Must verify all 100 icons render correctly across Chrome, Firefox, and Edge. Fallback: keep core navigation icons inline, externalize only brand/category icons used in the icon picker.

**Affected files**:
- [src/new-tab.html](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.html#L18-L3309) (remove inline SVG, remove static dialog markup)
- New: `src/assets/icons/sprite.svg`
- New: `src/assets/templates/` (optional dialog templates)
- Multiple JS files that trigger modal opens (add lazy-load logic)

**Dependencies**: None, but benefits from CSS splitting (Phase 2.5) to lazy-load dialog styles alongside dialog markup.

**Expected impact**: Addresses [06-performance-review.md Issue R1](file:///c:/Users/Administrator/Desktop/Homebase/docs/06-performance-review.md) — bloated initial DOM with 100 inline SVG symbols and 8 unused dialogs (High severity).

**Limitation addressed**: Performance Review Issue R1 — 1,452 static DOM elements parsed on every tab open.

---

### 3.3 Pre-Normalized Bookmark Search Index

**Description**: Build a pre-normalized search index during `loadBookmarks()` that stores lowercase titles and URLs in a parallel array. Replace the current `O(N)` linear scan with `Array.prototype.includes()` on pre-lowercased strings, and short-circuit after finding 5 matches instead of filtering the entire array.

**User benefit**: Eliminates perceptible keystroke latency in the search bar for users with large bookmark libraries (2,000–10,000 bookmarks). Currently, every keystroke triggers thousands of `toLowerCase()` + `includes()` calls.

**Technical difficulty**: Low — build the index once during `loadBookmarks()` (which already iterates all bookmarks). Replace the filter with a loop that breaks after 5 matches.

**Risk**: Low. The index is rebuilt whenever bookmarks change (existing `loadBookmarks()` already re-runs on CRUD). No behavior change; only performance improvement.

**Affected files**:
- [src/new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js#L10900-L10906) (bookmark search filtering)
- [src/new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) (`loadBookmarks` — add index construction)

**Dependencies**: None.

**Expected impact**: Addresses [06-performance-review.md Issue C1](file:///c:/Users/Administrator/Desktop/Homebase/docs/06-performance-review.md) — unthrottled linear scan of all bookmarks on search keystrokes (Medium severity).

**Limitation addressed**: Performance Review Issue C1 — O(N) bookmark scan on every keystroke.

---

### 3.4 Cross-Tab Fetch Deduplication via Storage Locking

**Description**: Implement an active fetch timestamp in `browser.storage.local` (e.g. `weatherFetchInProgress = timestamp`). When a new tab detects an in-progress fetch initiated <10 seconds ago, it waits for the `storage.onChanged` event to receive the cached result rather than initiating a duplicate HTTP request.

**User benefit**: Users who open multiple tabs simultaneously (e.g. browser startup with 5 restored tabs) avoid duplicate API calls to Open-Meteo weather and RSS news endpoints. Prevents potential HTTP 429 rate-limiting from free APIs.

**Technical difficulty**: Medium — requires careful lock acquisition/release semantics, timeout handling for abandoned locks (tab closed before completing fetch), and `storage.onChanged` listener coordination.

**Risk**: Medium. Race conditions between competing tabs acquiring the lock. Mitigation: use a 10-second lock TTL so abandoned locks auto-expire. If the lock owner crashes, other tabs fall back to direct fetch after timeout.

**Affected files**:
- [src/newtab/widgets/weather.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/weather.js) (add lock check before fetch)
- [src/newtab/widgets/news.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/news.js) (add lock check before fetch)

**Dependencies**: None, but benefits from unified storage service (Phase 2.4).

**Expected impact**: Addresses [06-performance-review.md Issue N2](file:///c:/Users/Administrator/Desktop/Homebase/docs/06-performance-review.md) — duplicate requests across multiple concurrent tabs (Low severity). Also reduces Open-Meteo API rate-limit risk.

**Limitation addressed**: Performance Review Issue N2 — No centralized request deduplication across multiple Homebase tabs.

---

### 3.5 Reduce Backdrop-Filter GPU Load with Smart Grouping

**Description**: Reduce the 44 distinct `backdrop-filter: blur(...)` CSS selectors by:
1. Grouping blurred sidebar widgets under a single shared composite backdrop layer (one blur surface instead of four).
2. Removing `backdrop-filter` from small elements like bookmark label text spans (use solid translucent backgrounds instead).
3. Automatically disabling blur when `appBatteryOptimization` is enabled or when `navigator.deviceMemory < 4`.

**User benefit**: 30–50% reduction in GPU utilization on integrated graphics (Intel/AMD Iris/Radeon). Significant reduction in laptop battery drain. Firefox users see the largest improvement due to Gecko/WebRender's more expensive backdrop compositing pipeline.

**Technical difficulty**: Medium — requires restructuring DOM layering so multiple widgets share a single blurred parent instead of each applying independent blur. Must preserve the existing glassmorphism visual aesthetic.

**Risk**: Medium. Visual appearance changes require careful design review. The existing `appPerformanceMode` setting already disables all backdrop filters; this improvement is about reducing the cost in standard mode. Requires testing across Chrome, Firefox, and Edge with various GPU configurations.

**Affected files**:
- [src/new-tab.css](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.css) (consolidate `backdrop-filter` selectors)
- [src/new-tab.html](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.html) (add shared backdrop container if needed)
- [src/newtab/settings/settings-preferences.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/settings/settings-preferences.js) (battery/memory detection)

**Dependencies**: Benefits from CSS splitting (Phase 2.5).

**Expected impact**: Addresses [06-performance-review.md Issue R5](file:///c:/Users/Administrator/Desktop/Homebase/docs/06-performance-review.md) — massive backdrop-filter GPU compositing load over active video (High severity).

**Limitation addressed**: Performance Review Issue R5 — 44 `backdrop-filter` rules creating 30–70% GPU utilization.

---

### 3.6 Custom Vanity Domain for Cloudflare R2 Assets

**Description**: Replace the hardcoded Cloudflare R2 bucket URL (`https://pub-552ebdc4e1414c8594cec0ac58404459.r2.dev/`) with a custom vanity domain (e.g. `assets.homebase-dashboard.com`) that can be redirected via CNAME without requiring an extension update.

**User benefit**: If the R2 bucket URL changes, expires, or experiences DNS issues, the maintainer can update the CNAME record to point to a new bucket or CDN without publishing and waiting for Chrome/Firefox Web Store review of a new extension version. Users experience zero downtime.

**Technical difficulty**: Low (code change) — replace one URL constant. Medium (infrastructure) — requires DNS domain registration and Cloudflare CNAME configuration.

**Risk**: Low for the code change. The vanity domain initially resolves to the same R2 bucket. Requires updating the `host_permissions` in both manifests to include the new domain and (optionally) retain the old R2 domain for backward compatibility.

**Affected files**:
- [src/new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js#L103-L104) (replace R2 URL constant)
- [manifests/manifest.chrome.json](file:///c:/Users/Administrator/Desktop/Homebase/manifests/manifest.chrome.json#L55) (update host permission)
- [manifests/manifest.firefox.json](file:///c:/Users/Administrator/Desktop/Homebase/manifests/manifest.firefox.json#L67) (update host permission)

**Dependencies**: DNS/infrastructure setup outside the codebase.

**Expected impact**: Addresses [04-code-review.md Issue TD3](file:///c:/Users/Administrator/Desktop/Homebase/docs/04-code-review.md) — hardcoded third-party Cloudflare R2 storage URL (Medium severity). Eliminates single point of failure for video wallpaper delivery.

**Limitation addressed**: Code Review Issue TD3 — Hardcoded R2 URL as single point of failure.

---

### 3.7 Narrow Wildcard Host Permissions

**Description**: Narrow broad host permission patterns to specific API paths:
- `https://www.google.com/*` → `https://www.google.com/s2/*` (favicon service only)
- `https://en.wikipedia.org/*` → `https://en.wikipedia.org/w/api.php*` (OpenSearch API only)
- `https://www.espn.com/*` → `https://www.espn.com/espn/rss/*` (RSS feed only)
- `https://www.aljazeera.com/*` → `https://www.aljazeera.com/xml/rss/*` (RSS feed only)

**User benefit**: Reduced extension privilege surface. Users see narrower, less alarming permission requests during installation. If the extension is ever compromised, attackers cannot read arbitrary pages from Google, Wikipedia, or ESPN.

**Technical difficulty**: Low — update URL patterns in both manifests.

**Risk**: Medium. If RSS feed or favicon URLs use paths outside the narrowed pattern, those requests will fail silently. Mitigation: test every integration endpoint after narrowing. Some feeds may use redirects to different paths.

**Affected files**:
- [manifests/manifest.chrome.json](file:///c:/Users/Administrator/Desktop/Homebase/manifests/manifest.chrome.json#L38-L56)
- [manifests/manifest.firefox.json](file:///c:/Users/Administrator/Desktop/Homebase/manifests/manifest.firefox.json#L50-L68)

**Dependencies**: Requires verification against all endpoints documented in [docs/11-api-integration-map.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/11-api-integration-map.md).

**Expected impact**: Addresses [05-security-review.md Finding MS-2](file:///c:/Users/Administrator/Desktop/Homebase/docs/05-security-review.md) — broad wildcard host permissions (Medium severity).

**Limitation addressed**: Security Review Finding MS-2 — Overly broad host permission wildcards.

---

### 3.8 Shared Extension API Polyfill

**Description**: Extract the duplicate `browser` vs `chrome` API normalization logic from both `new-tab.js` and `action-popup.js` into a shared `src/assets/js/extension-api.js` script loaded by both HTML pages.

**User benefit**: No direct user-visible change. Ensures that browser compatibility polyfills (e.g. wrapping Chrome's callback-based `storage` API into Promises for MV3) are consistent between the dashboard and toolbar popup. Bug fixes applied to one are automatically inherited by the other.

**Technical difficulty**: Low — extract existing code into a shared file, add a `<script defer>` tag to both HTML pages.

**Risk**: Low. The polyfill is executed early in both pages' lifecycles. Verify that `action-popup.html` loads `extension-api.js` before `action-popup.js`.

**Affected files**:
- New: `src/assets/js/extension-api.js`
- [src/new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js#L50-L75) (remove inline polyfill)
- [src/action-popup/action-popup.js](file:///c:/Users/Administrator/Desktop/Homebase/src/action-popup/action-popup.js#L49-L80) (remove inline polyfill)
- [src/new-tab.html](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.html) (add `<script defer>`)
- [src/action-popup/action-popup.html](file:///c:/Users/Administrator/Desktop/Homebase/src/action-popup/action-popup.html) (add `<script defer>`)

**Dependencies**: None.

**Expected impact**: Addresses [04-code-review.md Issue D2](file:///c:/Users/Administrator/Desktop/Homebase/docs/04-code-review.md) — duplicate browser extension API polyfill (Medium severity).

**Limitation addressed**: Code Review Issue D2 — Divergent API polyfills between dashboard and action popup.

---

### 3.9 Lower Virtualization Threshold and Use DocumentFragment

**Description**: Lower `VIRTUALIZATION_THRESHOLD` from 150 to 50 items. In Standard Mode (below threshold), accumulate all bookmark nodes in a single `document.createDocumentFragment()` before appending to `#bookmarks-grid` in one atomic DOM operation. Limit staggered animation delays to only the first 16 viewport-visible items.

**User benefit**: Eliminates layout thrashing and 40–120ms main-thread freezes when opening folders with 50–149 bookmarks. Users with moderately large folders see smoother, faster grid rendering.

**Technical difficulty**: Low — change one constant, wrap `appendChild` calls in a `DocumentFragment`, cap animation to 16 items.

**Risk**: Low. Lowering the threshold means more folders use virtualized rendering (which is already tested and working for >150 items). The `DocumentFragment` change is a standard DOM optimization with no behavioral side effects.

**Affected files**:
- [src/new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js#L6126) (`VIRTUALIZATION_THRESHOLD`)
- [src/new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js#L6137-L6228) (Standard Mode rendering)

**Dependencies**: None.

**Expected impact**: Addresses [06-performance-review.md Issue R2](file:///c:/Users/Administrator/Desktop/Homebase/docs/06-performance-review.md) (Medium — high virtualization threshold) and [Issue R6](file:///c:/Users/Administrator/Desktop/Homebase/docs/06-performance-review.md) (Low — heavy staggered animations).

**Limitation addressed**: Performance Review Issue R2 — 150-item threshold flooding DOM. Performance Review Issue R6 — Staggered keyframe animations on all grid items.

---

## Implementation Priority Matrix

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                           IMPROVEMENT PRIORITY MATRIX                                   │
├───────┬───────────────────────────────────────────┬────────────┬────────────┬───────────┤
│ Item  │ Description                               │ Difficulty │ Risk       │ Phase     │
├───────┼───────────────────────────────────────────┼────────────┼────────────┼───────────┤
│ 1.1   │ Include myWallpapers in backup            │ Very Low   │ Very Low   │ Phase 1   │
│ 1.2   │ Fix folder ID key mismatch                │ Very Low   │ Very Low   │ Phase 1   │
│ 1.3   │ Remove unused cookies permission          │ Very Low   │ Very Low   │ Phase 1   │
│ 1.4   │ Add explicit CSP to manifests             │ Low        │ Low        │ Phase 1   │
│ 1.5   │ Add news feed fetch timeout               │ Very Low   │ Very Low   │ Phase 1   │
│ 1.6   │ Fix favicon object URL memory leak        │ Very Low   │ Very Low   │ Phase 1   │
│ 1.7   │ Fix accent color 33 MB memory spike       │ Very Low   │ Very Low   │ Phase 1   │
│ 1.8   │ Add unit tests for pure utilities         │ Low        │ Very Low   │ Phase 1   │
│ 1.9   │ Add backup round-trip verification test   │ Low        │ Very Low   │ Phase 1   │
│ 1.10  │ Deduplicate normalizeWidgetOrder          │ Low        │ Low        │ Phase 1   │
│ 1.11  │ Skip hidden widget setup in idle queue    │ Low        │ Low        │ Phase 1   │
│ 1.12  │ Persist favicon negative cache            │ Low        │ Low        │ Phase 1   │
│ 1.13  │ Add debug logging to silent catch blocks  │ Very Low   │ Very Low   │ Phase 1   │
├───────┼───────────────────────────────────────────┼────────────┼────────────┼───────────┤
│ 2.1   │ Extract search runtime                    │ Medium     │ Medium     │ Phase 2   │
│ 2.2   │ Extract bookmark grid rendering           │ High       │ High       │ Phase 2   │
│ 2.3   │ Extract wallpaper/video playback          │ Medium     │ Medium–High│ Phase 2   │
│ 2.4   │ Create unified storage service            │ Medium     │ Low        │ Phase 2   │
│ 2.5   │ Split new-tab.css into modules            │ Medium     │ Medium     │ Phase 2   │
│ 2.6   │ Parallelize startup storage reads         │ Low        │ Low        │ Phase 2   │
│ 2.7   │ Add transactional backup import           │ Medium     │ Low        │ Phase 2   │
│ 2.8   │ Build bookmark node lookup Map            │ Low        │ Low        │ Phase 2   │
│ 2.9   │ Enforce favicon cache LRU eviction        │ Low–Medium │ Low        │ Phase 2   │
├───────┼───────────────────────────────────────────┼────────────┼────────────┼───────────┤
│ 3.1   │ Build-time script concatenation           │ Medium     │ Medium     │ Phase 3   │
│ 3.2   │ Lazy-load SVG sprites and modal dialogs   │ Medium–High│ Medium     │ Phase 3   │
│ 3.3   │ Pre-normalized bookmark search index      │ Low        │ Low        │ Phase 3   │
│ 3.4   │ Cross-tab fetch deduplication             │ Medium     │ Medium     │ Phase 3   │
│ 3.5   │ Reduce backdrop-filter GPU load           │ Medium     │ Medium     │ Phase 3   │
│ 3.6   │ Custom vanity domain for R2 assets        │ Low (code) │ Low        │ Phase 3   │
│ 3.7   │ Narrow wildcard host permissions          │ Low        │ Medium     │ Phase 3   │
│ 3.8   │ Shared extension API polyfill             │ Low        │ Low        │ Phase 3   │
│ 3.9   │ Lower virtualization threshold + Fragment │ Low        │ Low        │ Phase 3   │
└───────┴───────────────────────────────────────────┴────────────┴────────────┴───────────┘
```

---

## Cross-Reference: Limitations Addressed

Every item in this roadmap traces to a specific documented finding:

| Source Document | Finding ID | Severity | Addressed By |
|:---|:---|:---:|:---|
| [04-code-review.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/04-code-review.md) | TD1 — Custom wallpapers excluded from backup | Critical | **1.1** |
| [04-code-review.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/04-code-review.md) | T1 — Zero unit test suite | Critical | **1.8** |
| [04-code-review.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/04-code-review.md) | L1 — Monolithic new-tab.js | Critical | **2.1, 2.2, 2.3** |
| [04-code-review.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/04-code-review.md) | N1 — Storage key mismatch | High | **1.2** |
| [04-code-review.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/04-code-review.md) | D1 — Duplicate normalizeWidgetOrder | High | **1.10** |
| [04-code-review.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/04-code-review.md) | E1 — Silent error swallowing | High | **1.13** |
| [04-code-review.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/04-code-review.md) | E2 — Non-transactional backup import | High | **2.7** |
| [04-code-review.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/04-code-review.md) | T3 — No backup round-trip test | High | **1.9** |
| [04-code-review.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/04-code-review.md) | TD2 — Unbounded favicon cache | High | **2.9** |
| [04-code-review.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/04-code-review.md) | TD3 — Hardcoded R2 URL | Medium | **3.6** |
| [04-code-review.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/04-code-review.md) | D2 — Duplicate API polyfill | Medium | **3.8** |
| [04-code-review.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/04-code-review.md) | R1 — Extract bookmarks subsystem | High | **2.2** |
| [04-code-review.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/04-code-review.md) | R2 — Unified storage service | High | **2.4** |
| [04-code-review.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/04-code-review.md) | L2 — Monolithic new-tab.css | High | **2.5** |
| [04-code-review.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/04-code-review.md) | C1 — Monolithic bookmark state machine | High | **2.2** |
| [05-security-review.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/05-security-review.md) | MS-1 — Unused cookies permission | High | **1.3** |
| [05-security-review.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/05-security-review.md) | MS-2 — Broad wildcard host permissions | Medium | **3.7** |
| [05-security-review.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/05-security-review.md) | MS-3 — No explicit CSP | Medium | **1.4** |
| [06-performance-review.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/06-performance-review.md) | S1 — 38 unbundled scripts | High | **3.1** |
| [06-performance-review.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/06-performance-review.md) | S3 — Sequential storage reads | High | **2.6** |
| [06-performance-review.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/06-performance-review.md) | S4 — Eager hidden widget setup | Medium | **1.11** |
| [06-performance-review.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/06-performance-review.md) | R1 — Bloated initial DOM | High | **3.2** |
| [06-performance-review.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/06-performance-review.md) | R2 — High virtualization threshold | Medium | **3.9** |
| [06-performance-review.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/06-performance-review.md) | R5 — Backdrop-filter GPU load | High | **3.5** |
| [06-performance-review.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/06-performance-review.md) | R6 — Staggered keyframe animations | Low | **3.9** |
| [06-performance-review.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/06-performance-review.md) | M1 — Favicon object URL leak | High | **1.6** |
| [06-performance-review.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/06-performance-review.md) | M2 — 33 MB accent color allocation | High | **1.7** |
| [06-performance-review.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/06-performance-review.md) | N1 — News fetch no timeout | High | **1.5** |
| [06-performance-review.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/06-performance-review.md) | N2 — Cross-tab fetch duplication | Low | **3.4** |
| [06-performance-review.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/06-performance-review.md) | N3 — Favicon negative cache ephemeral | Medium | **1.12** |
| [06-performance-review.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/06-performance-review.md) | F1 — Monolithic 307 KB new-tab.js | High | **2.1, 2.2, 2.3** |
| [06-performance-review.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/06-performance-review.md) | F2 — Render-blocking 155 KB CSS | High | **2.5** |
| [06-performance-review.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/06-performance-review.md) | O1 — Unbounded favicon metadata growth | Medium | **2.9** |
| [06-performance-review.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/06-performance-review.md) | O2 — O(N) bookmark tree search | Medium | **2.8** |
| [06-performance-review.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/06-performance-review.md) | C1 — Unthrottled bookmark search scan | Medium | **3.3** |

---

> **Report Note**: This roadmap is strictly analytical. In accordance with AGENTS.md rules, no source code, manifest files, or project assets were modified.
