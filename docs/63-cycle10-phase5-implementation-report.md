# Homebase Improvement Cycle #10 Phase 5 — Implementation Report
## Favicon Resolution & Hydration Pipeline Extraction

### Executive Summary

In Cycle #10 Phase 5, the Favicon Resolution & Hydration Pipeline domain was extracted from `src/new-tab.js` into a dedicated core controller: `src/newtab/core/favicon-pipeline.js` (`window.HomebaseFaviconPipeline`).

This extraction encapsulates all favicon URL validation, origin candidate generation (`gstatic` and `googleS2`), in-memory resolved cache management, concurrent worker task queue scheduling (`MAX_CONCURRENT_FAVICON_TASKS: 6`), `IntersectionObserver` lazy hydration, object URL creation/revocation lifecycle, and fallback/negative cache handling.

All legacy function names and consumers in `src/new-tab.js` (including bookmark grids, bookmark dialogs, and search suggestion hydrators) remain fully functional via lightweight backward compatibility wrappers that delegate directly to `window.HomebaseFaviconPipeline`.

---

### Files Changed

1. **`src/newtab/core/favicon-pipeline.js`** (NEW, 778 lines)
   - Encapsulates `window.HomebaseFaviconPipeline` controller.
   - Manages task queue, concurrency limiting, in-memory resolved cache, `IntersectionObserver`, and object URL lifecycles.
   - Exposes primary API methods and legacy function aliases.

2. **`src/new-tab.html`** (MODIFIED, +1 line)
   - Registered `<script src="newtab/core/favicon-pipeline.js" defer></script>` immediately after `favicon-cache.js` and before `bookmark-storage.js`.

3. **`src/new-tab.js`** (MODIFIED, +90 lines, -500 lines, net -410 lines)
   - Replaced redundant favicon URL validation, candidate discovery, queue management, and network resolution blocks with lightweight delegation wrappers.
   - Removed orphaned duplicate declaration `const wallpaperObjectUrlCache = new Map();` to resolve browser new-tab freeze.
   - Total file size reduced from 6,128 lines to 5,717 lines (-10,323 bytes).

4. **`scripts/check-newtab-static.mjs`** (MODIFIED)
   - Added `"wallpaperObjectUrlCache"` to `movedDeclarationNames` (now checking 88 declarations) to prevent duplicate declarations across deferred runtime scripts.

5. **`tests/unit/favicon-pipeline.test.mjs`** (NEW, 455 lines)
   - 15 unit tests covering controller export, API aliases, candidate generation, URL validation, domain extraction, in-memory cache limit & eviction, object URL cleanup, task queue concurrency limits (max 6 active tasks), IntersectionObserver lifecycle, and offline fallback behavior.

6. **`docs/62-cycle10-phase5-plan.md`** (NEW)
   - Pre-implementation architecture audit and contract specification.

7. **`docs/63-cycle10-phase5-implementation-report.md`** (NEW)
   - Comprehensive implementation report and verification log.

---

### Functions Extracted

The following cohesive functions and operations were moved into `window.HomebaseFaviconPipeline`:

| Extracted Responsibility | Method on `HomebaseFaviconPipeline` | Backward Compatibility Alias |
|---|---|---|
| Target URL Validation | `isValidTargetUrl(rawUrl)` | `isValidFaviconTargetUrl` |
| Domain Key Extraction | `getDomainKey(rawUrl)` | `getDomainKeyFromUrl` |
| Candidate URL Discovery | `buildCandidates(rawUrl, size)` | `buildFaviconCandidates` |
| Favicon Resolution for Image | `resolveForImageTarget(options)` | `resolveFaviconForImageTarget` |
| Direct Raw URL Resolution | `getUrlForRawUrl(rawUrl)` | `getFaviconUrlForRawUrl` |
| Lazy Queue Registration | `queueResolution(img, resolveTask)` | `queueFaviconResolution` |
| Object URL Assignment | `setObjectUrlForImage(img, objectUrl)` | `setFaviconObjectUrlForImage` |
| Object URL Revocation | `revokeObjectUrl(img)` | `revokeFaviconObjectUrl` |
| Image Source Assignment | `setImageSrc(img, url)` | `setFaviconImageSrc` |
| Image Target Loading Helper | `loadObjectUrlIntoImage(...)` | `loadFaviconObjectUrlIntoImage` |
| Candidate Network Testing | `testCandidateUrl(candidate, accept)` | `testFaviconCandidateUrl` |
| Candidate Blob Testing | `testCandidateObjectUrl(url, accept)` | `testFaviconCandidateObjectUrl` |
| Worker Task Enqueueing | `enqueueTask(task)` | `enqueueFaviconTask` |
| Worker Queue Runner | `runNextTask()` | `runNextFaviconTask` |
| IntersectionObserver Setup | `ensureObserver()` | `ensureFaviconObserver` |
| In-Memory Cache Setter | `setResolvedEntry(domainKey, url, opts)` | `setFaviconResolved` |
| In-Memory Cache Getter | `getResolvedEntry(domainKey)` | `getFaviconResolvedEntry` |
| In-Memory URL Getter | `getResolvedUrl(domainKey)` | `getFaviconResolvedUrl` |
| In-Memory Cache Clear | `clearResolvedCache()` | — |
| Network Resolution Flow | `resolveFaviconFromNetwork(options)` | — |
| Result Application Flow | `applyResolvedFaviconResult(options)` | — |
| Cache Storage Helpers | `getFaviconCache()`, `cacheKeyFor(...)`, `readIconFromCache(...)`, `writeIconToCache(...)` | — |
| Blob / Response Helpers | `responseToObjectURL(...)`, `xhrFetchBlob(...)`, `blobToResponse(...)` | — |
| Controller Lifecycle | `initialize(options)`, `destroy()`, `getState()` | — |

---

### Lines Removed from `src/new-tab.js`

- **Lines removed**: 500 lines
- **Lines added (compatibility wrappers)**: 90 lines
- **Net line reduction**: 410 lines
- **Net byte delta**: -10,279 bytes
- **Current `src/new-tab.js` line count**: 5,718 lines (down from 6,128 lines after Phase 4, and 6,974 lines at Cycle 10 start)

---

### Compatibility Wrappers Retained in `src/new-tab.js`

To maintain full backward compatibility across the entire extension and prevent any breakage in existing bookmark and search logic, lightweight wrappers were retained in `src/new-tab.js`:

```javascript
const FAVICON_SIZE_PX = 48;
const FAVICON_NEGATIVE_TTL_MS = 10 * 60 * 1000;
const FAVICON_RESOLVED_CACHE_LIMIT = 300;
const MAX_CONCURRENT_FAVICON_TASKS = 6;
const FAVICON_CACHE_NAME = 'favicons-v1';
const FAVICON_OBSERVER_ROOT_MARGIN = '250px';
const FAVICON_OBSERVER_THRESHOLD = 0.01;

let faviconIntersectionObserver = null;

function setFaviconResolved(domainKey, url, options = {}) {
  if (window.HomebaseFaviconPipeline && typeof window.HomebaseFaviconPipeline.setResolvedEntry === 'function') {
    return window.HomebaseFaviconPipeline.setResolvedEntry(domainKey, url, options);
  }
}

function getFaviconResolvedEntry(domainKey) {
  if (window.HomebaseFaviconPipeline && typeof window.HomebaseFaviconPipeline.getResolvedEntry === 'function') {
    return window.HomebaseFaviconPipeline.getResolvedEntry(domainKey);
  }
  return null;
}

function getFaviconResolvedUrl(domainKey) {
  if (window.HomebaseFaviconPipeline && typeof window.HomebaseFaviconPipeline.getResolvedUrl === 'function') {
    return window.HomebaseFaviconPipeline.getResolvedUrl(domainKey);
  }
  return null;
}

function runNextFaviconTask() {
  if (window.HomebaseFaviconPipeline && typeof window.HomebaseFaviconPipeline.runNextTask === 'function') {
    return window.HomebaseFaviconPipeline.runNextTask();
  }
}

function enqueueFaviconTask(task) {
  if (window.HomebaseFaviconPipeline && typeof window.HomebaseFaviconPipeline.enqueueTask === 'function') {
    return window.HomebaseFaviconPipeline.enqueueTask(task);
  }
  return Promise.resolve();
}

function setObjectUrlForImage(img, objectUrl) {
  if (window.HomebaseFaviconPipeline && typeof window.HomebaseFaviconPipeline.setObjectUrlForImage === 'function') {
    return window.HomebaseFaviconPipeline.setObjectUrlForImage(img, objectUrl);
  }
}

function revokeObjectUrl(img) {
  if (window.HomebaseFaviconPipeline && typeof window.HomebaseFaviconPipeline.revokeObjectUrl === 'function') {
    return window.HomebaseFaviconPipeline.revokeObjectUrl(img);
  }
}

function setImageSrc(img, url) {
  if (window.HomebaseFaviconPipeline && typeof window.HomebaseFaviconPipeline.setImageSrc === 'function') {
    return window.HomebaseFaviconPipeline.setImageSrc(img, url);
  }
}

function queueFaviconResolution(img, resolveTask) {
  if (window.HomebaseFaviconPipeline && typeof window.HomebaseFaviconPipeline.queueResolution === 'function') {
    return window.HomebaseFaviconPipeline.queueResolution(img, resolveTask);
  }
}

function isValidFaviconTargetUrl(rawUrl) {
  if (window.HomebaseFaviconPipeline && typeof window.HomebaseFaviconPipeline.isValidTargetUrl === 'function') {
    return window.HomebaseFaviconPipeline.isValidTargetUrl(rawUrl);
  }
  return false;
}

function getDomainKeyFromUrl(rawUrl) {
  if (window.HomebaseFaviconPipeline && typeof window.HomebaseFaviconPipeline.getDomainKey === 'function') {
    return window.HomebaseFaviconPipeline.getDomainKey(rawUrl);
  }
  return '';
}

function buildFaviconCandidates(rawUrl) {
  if (window.HomebaseFaviconPipeline && typeof window.HomebaseFaviconPipeline.buildCandidates === 'function') {
    return window.HomebaseFaviconPipeline.buildCandidates(rawUrl);
  }
  return [];
}

async function getFaviconUrlForRawUrl(rawUrl) {
  if (window.HomebaseFaviconPipeline && typeof window.HomebaseFaviconPipeline.getUrlForRawUrl === 'function') {
    return window.HomebaseFaviconPipeline.getUrlForRawUrl(rawUrl);
  }
  return null;
}

async function applyResolvedFaviconResult(options) {
  if (window.HomebaseFaviconPipeline && typeof window.HomebaseFaviconPipeline.applyResolvedFaviconResult === 'function') {
    return window.HomebaseFaviconPipeline.applyResolvedFaviconResult(options);
  }
}

async function resolveFaviconForImageTarget(options) {
  if (window.HomebaseFaviconPipeline && typeof window.HomebaseFaviconPipeline.resolveForImageTarget === 'function') {
    return window.HomebaseFaviconPipeline.resolveForImageTarget(options);
  }
}
```

---

### Verification and Test Results

#### 1. Syntax Validation (`node --check`)
```powershell
node --check src/newtab/core/favicon-pipeline.js src/new-tab.js tests/unit/favicon-pipeline.test.mjs
# Status: PASS (0 errors)
```

#### 2. Static Invariant Checks (`scripts/check-newtab-static.mjs`)
```powershell
node scripts/check-newtab-static.mjs
# Status: PASS
# - 52 deferred local scripts checked
# - preload.js script tag exists once, remains in head, remains synchronous
# - new-tab.js is last deferred runtime script
# - 33 module paths checked
# - No old flat newtab/*.js path references
# - No root-level src/newtab/*.js module files
# - No stale moved lazy-load path references
# - Common moved declarations not duplicated (88 checked, including wallpaperObjectUrlCache)
```

#### 3. Full Unit Test Suite (`npm.cmd test`)
```powershell
npm.cmd test
# Status: PASS
# - Total tests: 330 passed, 0 failed (including 15 new tests in favicon-pipeline.test.mjs)
# - Test suite stages: 4/4 passed
```

#### 4. Build Pipeline (`npm.cmd run build`)
```powershell
npm.cmd run build
# Status: PASS
# - Built chrome -> dist\chrome
# - Built firefox -> dist\firefox
```

#### 5. Git Diff Formatting (`git diff --check`)
```powershell
git diff --check
# Status: PASS (clean whitespace)
```

---

### Protected File Verification

```powershell
git diff src/preload.js src/instant_load.js manifests/ dist/
# Output: (empty / 0 diff)
```

Strictly **zero** modifications were made to:
- `src/preload.js`
- `src/instant_load.js`
- `manifests/manifest.chrome.json`
- `manifests/manifest.firefox.json`
- `dist/*`

---

### Rollback Notes

If rollback is needed prior to commit:
```powershell
git checkout HEAD -- src/new-tab.html src/new-tab.js
rm -Force src/newtab/core/favicon-pipeline.js tests/unit/favicon-pipeline.test.mjs docs/62-cycle10-phase5-plan.md docs/63-cycle10-phase5-implementation-report.md
```
