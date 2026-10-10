# Homebase Improvement Cycle #11 Phase 3 — Checkpoint 2 Plan
## Bookmark Card Icon & Folder Preview Presentation Engine

> **Cycle ID**: Homebase Improvement Cycle #11 — Phase 3 Checkpoint 2  
> **Target Release**: Homebase v0.18.0  
> **Baseline Commit**: `dbcbaa9` ("Extract wallpaper gallery UI context and lazy loader")  
> **Status**: Planning & Architecture Phase — Awaiting Implementation  
> **Authority**: [AGENTS.md](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md), [docs/75-cycle11-phase3-audit.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/75-cycle11-phase3-audit.md), [docs/77-cycle11-phase3-checkpoint1-report.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/77-cycle11-phase3-checkpoint1-report.md)

---

## 1. Objective

Extract the core card icon rendering and folder preview presentation engine from [src/new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) into [src/newtab/bookmarks/bookmark-grid-controller.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/bookmark-grid-controller.js).

Target functions:
1. `renderBookmarkIconInto(wrapper, bookmarkNode, iconKey)` (~235 lines)
2. `renderFolderIconInto(wrapper, folderNode, iconKey)` (~110 lines)
3. `renderBookmark(bookmarkNode)` (~22 lines)
4. `renderBookmarkFolder(folderNode)` (~28 lines)
5. `ensureBookmarkFallback(wrapper, fallbackLetter)` (~10 lines)
6. `clearBookmarkImages(wrapper)` (~13 lines)

Estimated line reduction in `src/new-tab.js`: **~420 lines**.

---

## 2. Dependency Map & Analysis

### A. Presentation Functions

```text
renderBookmark(bookmarkNode)
  ├── creates .bookmark-item container
  ├── creates .bookmark-icon-wrapper
  └── calls renderBookmarkIconInto(wrapper, bookmarkNode)

renderBookmarkFolder(folderNode)
  ├── creates .bookmark-item container (data-is-folder="true")
  ├── creates .bookmark-icon-wrapper
  └── calls renderFolderIconInto(wrapper, folderNode)

renderBookmarkIconInto(wrapper, bookmarkNode, iconKey)
  ├── getIconKeyForNode (HomebaseBookmarkGridController)
  ├── ensureBookmarkFallback (local helper)
  ├── clearBookmarkImages (local helper)
  ├── custom icon check (bookmarkMetadata[id].icon)
  ├── custom icon cleared check (bookmarkMetadata[id].iconCleared)
  ├── fallback letter extraction & fallback color preference
  └── HomebaseFaviconPipeline integration:
      ├── buildCandidates(url)
      ├── getDomainKeyFromUrl(url)
      ├── resolveForImageTarget(options)
      ├── setImageSrc(img, url)
      └── queueResolution(img, task)

renderFolderIconInto(wrapper, folderNode, iconKey)
  ├── folderMetadata (color, icon, scale, offsetY, rotation)
  ├── appBookmarkFolderColorPreference
  ├── createSvgIconElement('bookmarkFolderLarge') (src/data.js)
  ├── tintSvgElement(baseSvg, appliedColor) (src/data.js)
  ├── getComplementaryColor(appliedColor) (src/data.js)
  └── Custom icon rendering:
      ├── builtin icon: createSvgIconElement(key), tintSvgElement(svg, iconFillColor)
      └── custom image icon: img.src = customIcon with CSS transforms
```

### B. Favicon Pipeline Dependencies

`renderBookmarkIconInto` interacts with `window.HomebaseFaviconPipeline`. All calls are routed cleanly through the controller:
- `buildFaviconCandidates` -> `HomebaseFaviconPipeline.buildCandidates`
- `getDomainKeyFromUrl` -> `HomebaseFaviconPipeline.getDomainKeyFromUrl`
- `resolveFaviconForImageTarget` -> `HomebaseFaviconPipeline.resolveForImageTarget`
- `setFaviconImageSrc` -> `HomebaseFaviconPipeline.setImageSrc`
- `queueFaviconResolution` -> `HomebaseFaviconPipeline.queueResolution`
- `revokeFaviconObjectUrl` -> `HomebaseFaviconPipeline.revokeObjectUrl`
- `debugFavicon` -> `HomebaseFaviconPipeline.debugFavicon`

### C. SVG & Color Helper Dependencies (from `src/data.js`)

`src/data.js` loads as script #3 before `bookmark-grid-controller.js` and provides:
- `window.createSvgIconElement(name, className)`
- `window.tintSvgElement(svg, color)`
- `window.getComplementaryColor(hex)`

---

## 3. DOM Ownership & State Requirements

### DOM Elements Owned:
- `.bookmark-item` (the root card element)
- `.bookmark-icon-wrapper` (icon container)
- `.bookmark-fallback-icon` (letter fallback badge)
- `img.bookmark-img` (favicon or custom uploaded image)
- `.bookmark-folder-custom-icon` (folder overlay badge)

### State Requirements & Bridges:
- `bookmarkMetadata`: Global mapping `(id -> { icon, iconCleared, ... })`.
- `folderMetadata`: Global mapping `(id -> { color, icon, scale, offsetY, rotation })`.
- Preference readers:
  - `appBookmarkFallbackColorPreference` (fallback `#00b8d4`)
  - `appBookmarkFallbackTextColorPreference`
  - `appBookmarkFolderColorPreference` (fallback `#FFFFFF`)

---

## 4. Script Ordering & Dependency Guard

In `src/new-tab.html`, ensure `bookmark-grid-controller.js` loads **after** `bookmark-storage.js` and `favicon-pipeline.js`, and **before** `src/new-tab.js`:

```html
  <script src="newtab/core/favicon-pipeline.js" defer></script>
  <script src="newtab/bookmarks/bookmark-storage.js" defer></script>
  <script src="newtab/bookmarks/bookmark-grid-controller.js" defer></script>
```

This ensures that when `renderBookmarkIconInto` executes, both `HomebaseFaviconPipeline` and `HomebaseBookmarkStorage` are fully evaluated and available.

---

## 5. Compatibility Bridge Plan

To preserve 100% backward compatibility for inline callers, context menus, and drag handlers in `src/new-tab.js`:

1. Export functions on `window.HomebaseBookmarkGridController`:
   - `renderBookmarkIconInto`
   - `renderFolderIconInto`
   - `renderBookmark`
   - `renderBookmarkFolder`
   - `ensureBookmarkFallback`
   - `clearBookmarkImages`
2. Provide window aliases:
   - `window.renderBookmarkIconInto = renderBookmarkIconInto;`
   - `window.renderFolderIconInto = renderFolderIconInto;`
   - `window.renderBookmark = renderBookmark;`
   - `window.renderBookmarkFolder = renderBookmarkFolder;`
3. Provide lightweight forwarding shims in `src/new-tab.js` to ensure legacy callers experience zero breakage.

---

## 6. Verification Protocol

1. **Syntax Validation**:
   ```powershell
   node --check src/newtab/bookmarks/bookmark-grid-controller.js
   node --check src/new-tab.js
   ```
2. **Static Collision & AST Invariant**:
   ```powershell
   node scripts/check-newtab-static.mjs
   ```
   *Must verify zero lexical declaration collisions across all 54 deferred scripts.*
3. **Automated Smoke Test**:
   ```powershell
   node scripts/smoke-newtab-file.mjs
   ```
4. **Unit Test Suite**:
   ```powershell
   npm.cmd test
   ```
5. **Build Verification**:
   ```powershell
   npm.cmd run build
   git diff src/preload.js src/instant_load.js manifests/ dist/
   ```

---

## 7. Manual Browser Verification Assessment

- **Risk Level**: **Low**. Card presentation logic is purely additive inside the newly extracted module with backward-compatible shims. The grid virtualization loop and drag handlers remain intact.
- **Decision**: **Manual browser verification is not required for this phase because the changes are isolated and covered by automated validation.**
