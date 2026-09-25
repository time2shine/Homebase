# Homebase — Browser Extension Security Audit

> **Auditor**: Senior Browser Extension Security Engineer  
> **Date**: 2026-09-24  
> **Scope**: Non-destructive, read-only security analysis — no code modifications  
> **Extension Version**: v0.14.0 (manifests), Manifest V3  
> **Target Browsers**: Google Chrome / Chromium, Mozilla Firefox  
> **Prerequisites**: [docs/00-project-baseline.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/00-project-baseline.md), [docs/01-architecture.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/01-architecture.md), [docs/02-feature-map.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/02-feature-map.md), [docs/03-data-architecture.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/03-data-architecture.md), [docs/04-code-review.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/04-code-review.md)

---

## Executive Summary

This security audit evaluates the **Homebase** browser extension across five primary threat dimensions: manifest permissions, browser/DOM security, storage security, external network communications, and third-party dependencies. The analysis is based entirely on verifiable evidence from the source code repository.

### Overall Security Posture: **Good with Targeted Remediation Needed**

**Key strengths:**
- **Zero remote code execution**: No remote scripts are loaded. All JavaScript is bundled locally.
- **Zero analytics/telemetry**: No tracking, profiling, or data exfiltration infrastructure exists.
- **No background service worker**: Reduces persistent attack surface. The extension runs only within its own pages.
- **No content scripts**: The extension does not inject code into third-party web pages.
- **Safe DOM rendering**: Critical user-facing data (bookmark titles, todo text, news titles, weather data) is rendered via `textContent` and `document.createElement()`, not raw `innerHTML` with interpolated variables.
- **Safe math evaluation**: The inline calculator uses a custom arithmetic parser — not `eval()` or `new Function()`.
- **Schema-validated backup import**: Import validation checks `schema`, `version`, and `isPlainObject()` before restoring data.

**Key concerns:**
- One **unused permission** (`cookies`) increases the declared attack surface unnecessarily.
- **No explicit Content Security Policy** is declared in manifests or HTML, relying entirely on browser defaults.
- **Backup import does not cover all user data**, creating a destructive data loss vector when restoring.
- **RSS-derived image URLs** from untrusted feeds are set directly to `img.src` without URL scheme validation.

---

## Findings Summary Matrix

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│                              SECURITY FINDINGS MATRIX                                │
├──────────────────────┬──────────┬──────────┬──────────┬──────────┬───────────────────┤
│ CATEGORY             │ CRITICAL │   HIGH   │  MEDIUM  │   LOW    │ TOTAL             │
├──────────────────────┼──────────┼──────────┼──────────┼──────────┼───────────────────┤
│ 1. Manifest Security │    0     │    1     │    2     │    1     │ 4 Findings        │
│ 2. Browser / DOM     │    0     │    0     │    2     │    2     │ 4 Findings        │
│ 3. Storage Security  │    1     │    0     │    1     │    1     │ 3 Findings        │
│ 4. External Comms    │    0     │    1     │    2     │    0     │ 3 Findings        │
│ 5. Dependencies      │    0     │    0     │    1     │    1     │ 2 Findings        │
├──────────────────────┼──────────┼──────────┼──────────┼──────────┼───────────────────┤
│ TOTALS               │    1     │    2     │    8     │    5     │ 16 Findings       │
└──────────────────────┴──────────┴──────────┴──────────┴──────────┴───────────────────┘
```

---

## 1. Manifest Security

### 1.1 Permission Analysis

Both manifests declare the following permissions:

| Permission | Chrome | Firefox | Justification in Code |
| :--- | :---: | :---: | :--- |
| `tabs` | ✅ | ✅ | Used extensively: `browser.tabs.create()`, `browser.tabs.update()`, `browser.tabs.query()`, `browser.tabs.remove()`, `browser.tabs.getCurrent()` across [tab-lifecycle.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/core/tab-lifecycle.js), [firefox-containers.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/integrations/firefox-containers.js), [new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js), and [action-popup.js](file:///c:/Users/Administrator/Desktop/Homebase/src/action-popup/action-popup.js). **Justified.** |
| `storage` | ✅ | ✅ | `browser.storage.local.get()` / `.set()` / `.remove()` used throughout for all persistent preferences. **Justified.** |
| `bookmarks` | ✅ | ✅ | `browser.bookmarks.getTree()`, `.create()`, `.remove()`, `.removeTree()`, `.move()`, `.update()` used for the bookmark grid. **Justified.** |
| `history` | ✅ | ✅ | `browser.history.search()` used in [new-tab.js:11043](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js#L11039-L11053) for search history suggestions (opt-in). **Justified.** |
| `clipboardRead` | ✅ | ✅ | `navigator.clipboard.readText()` used in [new-tab.js:6317](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js#L6317) for "Paste URL to Save" feature. **Justified.** |
| `cookies` | ✅ | ✅ | **No usage found.** Zero references to `browser.cookies` or `chrome.cookies` in the entire `src/` tree. **Not justified.** |
| `contextualIdentities` | ❌ | ✅ | Used in [firefox-containers.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/integrations/firefox-containers.js) for Firefox Multi-Account Containers. Firefox-only. **Justified.** |

---

### Finding MS-1: Unused `cookies` Permission Declared

- **Severity**: **High**
- **Location**: [manifests/manifest.chrome.json:31](file:///c:/Users/Administrator/Desktop/Homebase/manifests/manifest.chrome.json#L31), [manifests/manifest.firefox.json:42](file:///c:/Users/Administrator/Desktop/Homebase/manifests/manifest.firefox.json#L42)
- **Evidence**: `grep -r "browser\.cookies\|chrome\.cookies" src/` returns zero results. The `cookies` permission is declared in both manifests but never exercised by any JavaScript file.
- **Risk**: Declaring unused permissions violates the **principle of least privilege**. Browser web store reviewers flag unnecessary permissions. If a future vulnerability allows arbitrary code execution within the extension origin, the `cookies` permission would grant access to all cookies for all host permission domains (Google, Bing, Amazon, ESPN, etc.), enabling session hijacking.
- **Recommendation**: Remove `"cookies"` from the `permissions` array in both [manifest.chrome.json](file:///c:/Users/Administrator/Desktop/Homebase/manifests/manifest.chrome.json) and [manifest.firefox.json](file:///c:/Users/Administrator/Desktop/Homebase/manifests/manifest.firefox.json).

---

### Finding MS-2: Broad Wildcard Host Permissions

- **Severity**: **Medium**
- **Location**: [manifests/manifest.chrome.json:38-56](file:///c:/Users/Administrator/Desktop/Homebase/manifests/manifest.chrome.json#L38-L56), [manifests/manifest.firefox.json:50-68](file:///c:/Users/Administrator/Desktop/Homebase/manifests/manifest.firefox.json#L50-L68)
- **Evidence**: 17 host permission patterns are declared, including broad wildcards:
  ```
  "https://www.google.com/*"
  "https://en.wikipedia.org/*"
  "https://www.espn.com/*"
  "https://www.aljazeera.com/*"
  ```
  These grant the extension the ability to read/modify HTTP responses and cookies for any path on those domains — not just the specific API endpoints actually used.
- **Risk**: Overly broad patterns (e.g., `https://www.google.com/*`) permit CORS-bypass reads from any Google-hosted page, including authenticated services, if the extension code is ever compromised or injected. Combined with the unused `cookies` permission (MS-1), this creates a theoretically exploitable session-hijacking surface.
- **Recommendation**: Narrow host permissions to specific API paths where technically feasible. For example:
  - `https://suggestqueries.google.com/complete/*` instead of `https://www.google.com/*`
  - `https://api.bing.com/osjson.aspx*` (already narrow — good)

  Note: `https://www.google.com/*` is used by the Google S2 favicon service (`/s2/favicons?...`), so narrowing to `https://www.google.com/s2/*` would be more precise.

---

### Finding MS-3: No Explicit Content Security Policy

- **Severity**: **Medium**
- **Location**: Both manifests and [new-tab.html](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.html)
- **Evidence**: Neither manifest includes a `content_security_policy` key. The HTML file [new-tab.html](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.html) does not include a `<meta http-equiv="Content-Security-Policy">` tag. The extension relies entirely on the Manifest V3 browser-enforced default CSP.
- **Risk**: The MV3 default CSP (`script-src 'self'; object-src 'self'`) is strong and blocks inline scripts and remote script loading. However, it does not restrict `img-src`, `media-src`, `connect-src`, or `style-src`. This means:
  - Remote images from untrusted RSS feeds can load without restriction.
  - `fetch()` calls to any HTTPS endpoint are permitted if host permissions allow.
  - An explicit CSP would provide defense-in-depth and would document the extension's actual network surface.
- **Recommendation**: Add an explicit `content_security_policy.extension_pages` to both manifests:
  ```json
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'self'; img-src 'self' https://t2.gstatic.com https://www.google.com https://pub-552ebdc4e1414c8594cec0ac58404459.r2.dev blob: data:; media-src 'self' https://pub-552ebdc4e1414c8594cec0ac58404459.r2.dev blob:; connect-src 'self' https://api.open-meteo.com https://geocoding-api.open-meteo.com https://suggestqueries.google.com https://api.bing.com https://duckduckgo.com https://ff.search.yahoo.com https://suggest.yandex.com https://completion.amazon.com https://feeds.bbci.co.uk https://www.aljazeera.com https://www.espn.com https://www.espncricinfo.com https://feeds.feedburner.com https://en.wikipedia.org https://t2.gstatic.com https://www.google.com https://pub-552ebdc4e1414c8594cec0ac58404459.r2.dev;"
  }
  ```

---

### Finding MS-4: No Background Service Worker or Content Scripts

- **Severity**: **Low** (Positive finding)
- **Location**: Both manifests
- **Evidence**: Neither manifest declares `background`, `service_worker`, or `content_scripts` keys.
- **Risk**: This is a security strength, not a weakness. The extension surface is strictly limited to its own extension pages (`new-tab.html` and `action-popup.html`). No code runs persistently, and no code is injected into third-party web pages. This eliminates entire classes of extension vulnerabilities (content script injection, message port hijacking, persistent background exfiltration).
- **Recommendation**: Maintain this posture. Do not introduce a background service worker or content scripts unless explicitly required.

---

## 2. Browser Security (DOM / XSS / Injection)

### 2.1 XSS Vector Analysis

A systematic review of all DOM mutation patterns in the codebase reveals a **disciplined DOM construction approach**:

#### Safe Patterns (Verified)

| Area | File | Evidence |
| :--- | :--- | :--- |
| Bookmark titles | [new-tab.js:5312](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js#L5312) | `titleSpan.textContent = title;` |
| News titles | [news.js:319](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/news.js#L319) | `anchor.textContent = title;` |
| News time labels | [news.js:327](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/news.js#L327) | `time.textContent = timeAgo;` |
| Todo text | [instant_load.js:324](file:///c:/Users/Administrator/Desktop/Homebase/src/instant_load.js#L324) | `text.textContent = item.text;` |
| Weather data | [instant_load.js:140](file:///c:/Users/Administrator/Desktop/Homebase/src/instant_load.js#L140) | `setText(el, val)` → `el.textContent = nextStr;` |
| Quote display | [quote.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/quote.js) | Uses `textContent` for quote text and author |
| News hover preview | [news.js:394-395](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/news.js#L394-L395) | `titleEl.textContent = title;`, `descEl.textContent = desc;` |
| Search suggestions | [new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) | Suggestions filtered to `typeof val === 'string'` before display |
| Math evaluator | [search-utils.js:1-5](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/search/search-utils.js#L1-L5) | Regex allowlist `[\\d\\.\\s\\+\\-\\*\\/\\%\\^\\(\\)]+$` — no `eval()` |

#### innerHTML Usage Analysis

50+ `innerHTML` assignments were identified across the codebase. All fall into two safe categories:

1. **Reset patterns** (`el.innerHTML = ''`): Used to clear containers before rebuilding DOM via `createElement`. Found in [news.js:77](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/news.js#L77), [todo.js:85](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/todo.js#L85), [weather.js:806](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/weather.js#L806), [folder-picker.js:103](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/folder-picker.js#L103), and others.

2. **Static template literals** (no interpolated variables): Used for SVG icon injection or static HTML structure. Found in [dock-navigation.js:24](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/core/dock-navigation.js#L24), [settings-ui.js:354](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/settings/settings-ui.js#L354), [new-tab.js:5665](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js#L5665). These templates contain only hardcoded SVG paths and CSS class names — no user-controlled data is interpolated.

**No `innerHTML` assignment with interpolated user-controlled data was found.**

Additionally: `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval()`, and `new Function()` are **not used** anywhere in first-party code.

---

### Finding DOM-1: RSS Image URLs Set to `img.src` Without Scheme Validation

- **Severity**: **Medium**
- **Location**: [news.js:398](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/news.js#L398), [news.js:194-218](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/news.js#L194-L218)
- **Evidence**: The `parseNewsItemsFromXml()` function extracts image URLs from RSS feed XML elements (`<media:thumbnail>`, `<media:content>`, `<enclosure>`, and inline `<img>` tags in `<content:encoded>`). These URLs are extracted via `getAttribute('url')` or `getAttribute('src')` from the parsed XML DOM and stored as-is. When a news hover preview is shown, the URL is set directly:
  ```javascript
  // news.js:398
  imageEl.src = image;
  ```
  No URL scheme validation is performed. A crafted RSS feed could supply a `javascript:` URL, a `data:text/html,...` URL, or any arbitrary scheme as the image source.
- **Risk**: While `img.src` with a `javascript:` URI generally does not execute script in modern browsers (unlike `<a href="javascript:...">`), certain `data:` URIs could trigger unexpected behavior. A `data:image/svg+xml,...` URI containing embedded script may execute in some browser contexts. In the extension origin, this could theoretically access extension APIs and storage.
- **Recommendation**: Add a URL scheme validation check before assigning RSS-derived image URLs:
  ```javascript
  function isSafeImageUrl(url) {
    if (!url || typeof url !== 'string') return false;
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'https:' || parsed.protocol === 'http:';
    } catch { return false; }
  }
  ```

---

### Finding DOM-2: RSS Feed Link URLs Used as `<a href>` Without Scheme Validation

- **Severity**: **Medium**
- **Location**: [news.js:316](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/news.js#L316), [instant_load.js:447](file:///c:/Users/Administrator/Desktop/Homebase/src/instant_load.js#L447)
- **Evidence**: News item `link` values extracted from RSS XML (via `linkEl.getAttribute('href') || linkEl.textContent`) are set directly as anchor hrefs:
  ```javascript
  // news.js:316
  anchor.href = link;
  anchor.target = '_blank';
  anchor.rel = 'noreferrer noopener';
  ```
  A crafted RSS item could use `javascript:alert(1)` as its link URL. When clicked, this would execute in the extension's privileged origin.
- **Risk**: Although the code correctly sets `rel='noreferrer noopener'` and `target='_blank'`, the `javascript:` scheme is still executable via `<a href>` click navigation. Within the extension origin, JavaScript execution has access to `browser.bookmarks`, `browser.history`, `browser.tabs`, and `browser.storage.local`.
- **Recommendation**: Validate the link URL scheme before creating the anchor:
  ```javascript
  const safeLink = /^https?:/i.test(link) ? link : '#';
  anchor.href = safeLink;
  ```
  The existing news sources (BBC, Al Jazeera, ESPN, Feedburner) are trusted first-party feeds, but if custom RSS sources are ever supported, this becomes critical.

---

### Finding DOM-3: Dynamic Script Loading Uses Extension-Local Paths Only

- **Severity**: **Low** (Positive finding)
- **Location**: [new-tab.js:486-511](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js#L486-L511)
- **Evidence**: The `loadScriptOnce(src)` function creates `<script>` elements dynamically. All call sites pass hardcoded local paths:
  ```javascript
  loadScriptOnce('newtab/settings/settings-ui.js');
  loadScriptOnce('newtab/wallpaper/gallery-ui.js');
  loadScriptOnce('assets/js/bookmark-editor.js');
  loadScriptOnce('assets/js/icon-picker.js');
  ```
  No user-controlled or externally-derived values are ever passed to this function.
- **Risk**: Minimal. The function does not accept remote URLs, and MV3 CSP blocks remote script loading. However, the function itself does not validate that `src` is a local relative path.
- **Recommendation**: Add a defensive guard to reject any `src` containing `://` or starting with `/`:
  ```javascript
  if (src.includes('://') || src.startsWith('/')) {
    return Promise.reject(new Error('Remote scripts not allowed'));
  }
  ```

---

### Finding DOM-4: HTML Sanitization Via DOMParser Is Correctly Isolated

- **Severity**: **Low** (Positive finding)
- **Location**: [news.js:121-143](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/news.js#L121-L143), [news.js:162-223](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/news.js#L162-L223)
- **Evidence**: RSS content is parsed using `DOMParser`:
  - XML feeds: `new DOMParser().parseFromString(xmlText, 'text/xml')` — XML mode does not execute scripts.
  - HTML stripping: `new DOMParser().parseFromString(raw, 'text/html')` — creates an inert document. Only `doc.body.textContent` is extracted (safe).
  - Image extraction: Parsed HTML DOM is queried with `doc.querySelector('img').getAttribute('src')` — only the attribute string is extracted, not rendered.
- **Risk**: The `DOMParser` API creates documents that are disconnected from the live page DOM. Scripts embedded in the parsed content do not execute. The code correctly extracts only `textContent` and attribute strings, never appending parsed nodes to the live DOM.
- **Recommendation**: No action required. This is a correct and safe pattern.

---

## 3. Storage Security

### 3.1 Storage Layer Overview

| Mechanism | Encryption | Access Control | Isolation |
| :--- | :--- | :--- | :--- |
| `browser.storage.local` | None | Extension origin only | Per-extension sandbox |
| `window.localStorage` | None | Extension origin only | Per-origin sandbox |
| `window.caches` (Cache API) | None | Extension origin only | Per-origin sandbox |
| `window.sessionStorage` | None | Extension origin only | Per-tab isolation |

All storage mechanisms are sandboxed to the extension's unique origin (`chrome-extension://<id>` or `moz-extension://<uuid>`). Cross-origin access is blocked by the browser security model. No authentication tokens, passwords, API keys, or PII are stored.

---

### Finding ST-1: Backup Import Destroys Unrestorable User Data

- **Severity**: **Critical**
- **Location**: [backup-import.js:147-179](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/settings/backup-import.js#L147-L179)
- **Evidence**: The import function iterates over `HOMEBASE_OWNED_STORAGE_KEYS` (76 keys). For any key present in the allowlist but **absent** from the imported backup file, it calls `browser.storage.local.remove(key)` (line 178). This means importing a backup **deletes** any keys that were not in the backup file.

  Critically, the following user data is **never included** in backup exports and is therefore permanently destroyed on import:
  - `myWallpapers` — user-uploaded custom wallpaper metadata
  - Cache API binary blobs — user-uploaded wallpaper images, cached videos, and cached favicon data

  The `HOMEBASE_OWNED_STORAGE_KEYS` array in [backup-import.js:4-76](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/settings/backup-import.js#L4-L76) does not include `myWallpapers`, so it is neither exported nor protected during import.

- **Risk**: A user who (1) uploads custom wallpapers, (2) exports a backup, and (3) imports that backup will permanently lose all custom wallpaper metadata and associated cached binary assets. There is no warning, confirmation, or recovery mechanism. This is a **destructive data integrity failure**.
- **Recommendation**:
  1. Add `myWallpapers` to the `HOMEBASE_OWNED_STORAGE_KEYS` array so it is included in exports and preserved during imports.
  2. Add a pre-import confirmation dialog listing what will be overwritten and what may be lost.
  3. Consider changing the import strategy from "delete missing keys" to "merge/update only present keys" to avoid destructive removal.

---

### Finding ST-2: localStorage Mirrors Store User Preferences in Plaintext

- **Severity**: **Medium**
- **Location**: [preload.js](file:///c:/Users/Administrator/Desktop/Homebase/src/preload.js), [instant_load.js](file:///c:/Users/Administrator/Desktop/Homebase/src/instant_load.js)
- **Evidence**: Approximately 15 `localStorage` keys mirror canonical `browser.storage.local` values for instant paint performance. These include:
  - `fast-weather` — cached weather data including user's city name, coordinates, and temperature
  - `fast-todo` — full todo list text content
  - `fast-news` — cached news article titles and links
  - `wallpaperStartupState` — active wallpaper selection metadata

  These values are stored as plaintext JSON in `localStorage`, which is accessible to any code running in the extension origin.
- **Risk**: In the current architecture (no content scripts, no remote code), access is limited to first-party extension code only. The risk would escalate if content scripts, background pages, or third-party libraries with DOM access were introduced in the future. Weather data containing city names constitutes **soft PII** (coarse location).
- **Recommendation**: Document the mirror keys in a security-sensitive registry. If the extension ever adds content scripts or third-party integrations, consider replacing `localStorage` mirrors with a more isolated mechanism (e.g., `sessionStorage` or in-memory caches populated from `browser.storage.local`).

---

### Finding ST-3: Weather Location Data (Coordinates) Stored Persistently

- **Severity**: **Low**
- **Location**: Storage keys `weatherLat`, `weatherLon`, `weatherCityName` in [backup-import.js:72-75](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/settings/backup-import.js#L72-L75)
- **Evidence**: User-entered weather location (city name, latitude, longitude) is stored persistently in `browser.storage.local` and is included in backup exports. The `fast-weather` localStorage mirror also contains the city name.
- **Risk**: Geographic coordinates constitute **coarse PII**. If a backup file is shared (e.g., posted publicly for troubleshooting), the user's location is exposed in plaintext within the JSON.
- **Recommendation**: Add a note in the export UI or PRIVACY.md that backup files contain location data. Consider optionally excluding weather location from backup exports, or redacting coordinates from shared diagnostic exports.

---

## 4. External Communication

### 4.1 Network Request Inventory

All outbound network requests are initiated by `fetch()`. No `XMLHttpRequest`, WebSocket, or Server-Sent Events are used.

| Endpoint | Purpose | Data Sent | Protocol | File |
| :--- | :--- | :--- | :--- | :--- |
| `api.open-meteo.com` | Weather forecast | Lat/lon coordinates | HTTPS | [weather.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/weather.js) |
| `geocoding-api.open-meteo.com` | City → coordinates | City name string | HTTPS | [weather.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/weather.js) |
| `suggestqueries.google.com` | Search suggestions | Search query text | HTTPS | [new-tab.js:10430](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js#L10430) |
| `api.bing.com/osjson.aspx` | Search suggestions | Search query text | HTTPS | [new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) |
| `duckduckgo.com/ac/` | Search suggestions | Search query text | HTTPS | [new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) |
| `ff.search.yahoo.com` | Search suggestions | Search query text | HTTPS | [new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) |
| `suggest.yandex.com` | Search suggestions | Search query text | HTTPS | [new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) |
| `completion.amazon.com` | Search suggestions | Search query text | HTTPS | [new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) |
| `feeds.bbci.co.uk` | RSS news feed | None (GET only) | HTTPS | [news.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/news.js) |
| `www.aljazeera.com` | RSS news feed | None (GET only) | HTTPS | [news.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/news.js) |
| `www.espn.com` | RSS news feed | None (GET only) | HTTPS | [news.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/news.js) |
| `www.espncricinfo.com` | RSS news feed | None (GET only) | HTTPS | [news.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/news.js) |
| `feeds.feedburner.com` | RSS news feed | None (GET only) | HTTPS | [news.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/news.js) |
| `t2.gstatic.com` | Favicon resolution | Bookmark domain | HTTPS | [new-tab.js:3412](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js#L3412) |
| `www.google.com/s2/favicons` | Favicon resolution | Bookmark domain | HTTPS | [new-tab.js:3413](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js#L3413) |
| `pub-552ebdc4e1414c8594cec0ac58404459.r2.dev` | Gallery manifest + media | None (GET only) | HTTPS | [new-tab.js:103-104](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js#L103-L104) |

**All requests use HTTPS exclusively.** No HTTP (plaintext) endpoints exist.

---

### Finding NET-1: Search Queries Transmitted to Third-Party Servers in Real Time

- **Severity**: **High**
- **Location**: [new-tab.js:10430](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js#L10430)
- **Evidence**: When the user types in the search bar with suggestions enabled, each keystroke (after debounce) triggers a `fetch()` to the selected search engine's suggestion API:
  ```javascript
  const res = await fetch(engine.suggestionUrl + encodeURIComponent(query), { signal });
  ```
  This transmits partial search queries (keystrokes in progress) to Google, Bing, DuckDuckGo, Yahoo, Yandex, or Amazon servers. The destination server receives the user's IP address, User-Agent, and the evolving query text.
- **Risk**: This is a **significant privacy exposure** for a "privacy-first" extension. Real-time keystroke transmission enables:
  - Server-side query profiling by the search engine operator
  - IP-correlated browsing intent tracking
  - Potential exposure of sensitive searches before the user completes typing

  This behavior **is opt-in** (controlled by `appSearchSuggestionsEnabled`, default `true`) and **is documented** in [PRIVACY.md:62-65](file:///c:/Users/Administrator/Desktop/Homebase/src/PRIVACY.md#L62-L65).
- **Recommendation**:
  1. Change the default value of `appSearchSuggestionsEnabled` from `true` to `false` to align with the privacy-first brand.
  2. Add a prominent first-run disclosure when the user enables suggestions, explaining that partial queries are sent to third-party servers.
  3. Consider adding a minimum character threshold (e.g., 3+ characters) before triggering suggestion requests to reduce keystroke leakage.

---

### Finding NET-2: Favicon Resolution Leaks User's Bookmark Domains to Google

- **Severity**: **Medium**
- **Location**: [new-tab.js:3408-3414](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js#L3408-L3414)
- **Evidence**: For each bookmark without a cached favicon, the extension sends the bookmark's origin URL to Google's favicon services:
  ```javascript
  const gstaticV2 = `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&...&url=${encodeURIComponent(origin)}&size=${FAVICON_SIZE_PX}`;
  const googleS2 = `https://www.google.com/s2/favicons?sz=${FAVICON_SIZE_PX}&domain_url=${encodeURIComponent(origin)}`;
  ```
  This reveals the user's bookmarked domains (e.g., banking sites, health services, private intranets) to Google's servers.
- **Risk**: Google receives a full inventory of the user's bookmarked domains correlated with their IP address. For a privacy-focused extension, this is a significant information leak. The extension mitigates this with multi-tier caching (`faviconResolvedCache`, `faviconNegativeCache`, and Cache API), so each domain is only queried once. However, the initial cold-start resolution exposes the full bookmark inventory.
- **Recommendation**:
  1. Add a setting to disable remote favicon resolution entirely, falling back to letter-based icons.
  2. Consider implementing local favicon extraction (fetching the bookmark URL's HTML and parsing `<link rel="icon">`) to avoid Google as an intermediary.
  3. Document the favicon behavior in the privacy policy (currently partially covered at [PRIVACY.md:47-50](file:///c:/Users/Administrator/Desktop/Homebase/src/PRIVACY.md#L47-L50)).

---

### Finding NET-3: Gallery Manifest Fetched from Single Cloudflare R2 Bucket

- **Severity**: **Medium**
- **Location**: [new-tab.js:103-104](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js#L103-L104)
- **Evidence**:
  ```javascript
  const VIDEOS_JSON_URL = 'https://pub-552ebdc4e1414c8594cec0ac58404459.r2.dev/manifest.json';
  const GALLERY_ASSETS_BASE_URL = 'https://pub-552ebdc4e1414c8594cec0ac58404459.r2.dev/v/';
  ```
  The wallpaper gallery manifest and all curated media assets are served from a single Cloudflare R2 public bucket. The manifest is a JSON file parsed with standard `response.json()`.
- **Risk**:
  - **Manifest integrity**: The manifest JSON is parsed and its contents determine which media URLs are fetched and displayed. If the R2 bucket were compromised, a malicious manifest could point to arbitrary media URLs. However, since MV3 CSP blocks remote script execution, the impact is limited to displaying attacker-controlled images/videos — not code execution.
  - **Availability**: Single point of failure for the entire wallpaper gallery feature.
  - **Supply chain**: The R2 bucket is controlled by the extension developer. No integrity verification (e.g., subresource integrity hashes or content signing) is performed on the manifest or media.
- **Recommendation**:
  1. Add manifest schema validation (verify expected structure, data types, and URL prefixes match the known R2 base URL).
  2. Consider adding a `manifestVersion` or checksum field to detect unauthorized modifications.
  3. Document the R2 endpoint in operational runbooks for incident response.

---

## 5. Dependencies

### 5.1 Dependency Inventory

| Dependency | Type | Location | Version | Source |
| :--- | :--- | :--- | :--- | :--- |
| **Sortable.js** | Vendor minified JS | [src/assets/js/Sortable.min.js](file:///c:/Users/Administrator/Desktop/Homebase/src/assets/js/Sortable.min.js) | 1.15.7 | Bundled file (not from npm) |
| **npm packages** | Runtime | [package.json](file:///c:/Users/Administrator/Desktop/Homebase/package.json) | N/A | `dependencies: {}`, `devDependencies: {}` — zero packages |

**Zero runtime or dev npm dependencies.** No `node_modules` directory exists. Build scripts use only Node.js built-in modules (`node:fs`, `node:path`, `node:zlib`).

---

### Finding DEP-1: Vendored Sortable.js May Be Outdated

- **Severity**: **Medium**
- **Location**: [src/assets/js/Sortable.min.js](file:///c:/Users/Administrator/Desktop/Homebase/src/assets/js/Sortable.min.js)
- **Evidence**: The vendored file appears to be SortableJS v1.15.7 based on the code review document and the minified source content. The file is minified and contains no source map or version header comment. The SortableJS GitHub repository (`SortableJS/Sortable`) has released subsequent versions with bug fixes.
- **Risk**: The vendored file is a single self-contained library with no network access, no DOM content injection from user data, and no known critical CVEs at this version. However:
  - No integrity verification mechanism (e.g., checksum file) exists to confirm the vendored file matches the official release.
  - The minified code is opaque and difficult to audit for intentional backdoors.
  - Future security patches to Sortable.js would not be automatically applied.
- **Recommendation**:
  1. Add a `Sortable.min.js.sha256` checksum file alongside the vendor library to enable integrity verification.
  2. Add a comment to the top of the file (or a companion `Sortable.version.txt`) documenting the exact version, download source, and SHA-256 hash.
  3. Periodically check the SortableJS repository for security advisories.

---

### Finding DEP-2: Zero npm Dependencies Eliminates Supply Chain Risk

- **Severity**: **Low** (Positive finding)
- **Location**: [package.json](file:///c:/Users/Administrator/Desktop/Homebase/package.json)
- **Evidence**: `"dependencies": {}` and `"devDependencies": {}`. Build scripts in [scripts/build.mjs](file:///c:/Users/Administrator/Desktop/Homebase/scripts/build.mjs) use exclusively Node.js built-in modules. No `package-lock.json` exists. No `node_modules` directory exists.
- **Risk**: This eliminates the entire npm supply chain attack surface (dependency confusion, typosquatting, malicious postinstall scripts, transitive dependency vulnerabilities). This is an exceptional security posture for a JavaScript project.
- **Recommendation**: Maintain this posture. If npm dependencies are ever introduced, require lockfile (`package-lock.json`) committal and implement `npm audit` in CI.

---

## 6. Additional Security Observations

### 6.1 Clipboard Handling

- **Location**: [new-tab.js:6313-6356](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js#L6313-L6356)
- **Analysis**: The `handlePasteBookmark()` function reads clipboard text via `navigator.clipboard.readText()` only on explicit user action (paste event or menu click). The clipboard text undergoes basic URL validation (`text.includes("://")`) and protocol normalization before being passed to `browser.bookmarks.create()`. The clipboard text is not stored, logged, or transmitted.
- **Assessment**: Acceptable. The `clipboardRead` permission is used only on explicit user gesture, and the read value is consumed locally and immediately.

### 6.2 Bookmark Custom Icons

- **Location**: [new-tab.js:5021](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js#L5021), [new-tab.js:5278](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js#L5278)
- **Analysis**: Custom bookmark icons (`meta.icon`) are stored as data URLs or blob URLs in `browser.storage.local` under the `bookmarkCustomMetadata` key. These are set to `img.src` at render time. Since these values are user-uploaded (via file picker in the bookmark editor), the user has explicit control over the content.
- **Assessment**: Low risk. The user is the only source of custom icon data. The values are confined to the extension storage sandbox.

### 6.3 External Link Safety

- **Location**: [news.js:318](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/news.js#L318), [settings-ui.js:814](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/settings/settings-ui.js#L814)
- **Analysis**: News item anchors consistently set `rel='noreferrer noopener'` and `target='_blank'`. The settings UI uses `window.open(url, '_blank', 'noopener,noreferrer')`. This prevents `window.opener` hijacking (tabnabbing).
- **Assessment**: Good practice correctly applied.

### 6.4 No Telemetry Infrastructure

- **Evidence**: Zero references to analytics SDKs, pixel trackers, error reporting services (Sentry, Bugsnag), or remote logging endpoints exist in the codebase.
- **Assessment**: Consistent with the extension's privacy-first positioning.

---

## 7. Risk Prioritization and Remediation Roadmap

### Immediate Actions (Critical)

| ID | Finding | Action |
| :--- | :--- | :--- |
| ST-1 | Backup import destroys `myWallpapers` data | Add `myWallpapers` to backup keys; change import to merge-not-delete for unrecognized keys |

### Short-Term Actions (High)

| ID | Finding | Action |
| :--- | :--- | :--- |
| MS-1 | Unused `cookies` permission | Remove from both manifests |
| NET-1 | Search suggestions default enabled | Consider changing default to `false`; add minimum character threshold |

### Medium-Term Actions (Medium)

| ID | Finding | Action |
| :--- | :--- | :--- |
| MS-2 | Broad host permission wildcards | Narrow to specific API paths |
| MS-3 | No explicit CSP | Add `content_security_policy` to both manifests |
| DOM-1 | RSS image URLs lack scheme validation | Add `https:` / `http:` allowlist before `img.src` assignment |
| DOM-2 | RSS link URLs lack scheme validation | Add `https:` / `http:` allowlist before `anchor.href` assignment |
| NET-2 | Favicon domains leaked to Google | Add opt-out setting; document in privacy policy |
| NET-3 | Gallery manifest lacks integrity checks | Add schema validation and version checks |
| ST-2 | localStorage mirrors in plaintext | Document security boundaries; monitor for future risk escalation |
| DEP-1 | Vendored Sortable.js integrity | Add checksum file and version documentation |

### Low Priority (Low)

| ID | Finding | Action |
| :--- | :--- | :--- |
| MS-4 | No background/content scripts (positive) | Maintain current posture |
| DOM-3 | loadScriptOnce lacks path guard | Add defensive `://` check |
| DOM-4 | DOMParser isolation is correct (positive) | No action needed |
| ST-3 | Weather coordinates in backup | Add documentation note |
| DEP-2 | Zero npm deps (positive) | Maintain current posture |

---

## 8. Conclusion

Homebase demonstrates a **strong foundational security posture** for a browser extension:
- Zero remote code execution surface
- Zero third-party tracking or analytics
- Disciplined DOM construction (textContent over innerHTML for user data)
- Minimal dependency footprint (single vendored library)
- All network communication over HTTPS only

The primary areas requiring attention are:
1. **Removing the unused `cookies` permission** — a quick, high-impact fix
2. **Hardening the backup/import system** against data loss
3. **Adding URL scheme validation** for RSS-derived URLs
4. **Declaring an explicit Content Security Policy** for defense-in-depth

No code was modified during this audit. All findings are supported by verifiable evidence from the repository source code.
