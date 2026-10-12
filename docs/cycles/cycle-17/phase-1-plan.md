# Cycle #17 Execution Roadmap & Planning

## 1. Primary Objective
Building upon the successful decoupling of the Search subsystem in Cycles #15 and #16, Cycle #17 addresses the next highest architectural debt hotspot in the Homebase repository.

Based on the findings from [`docs/cycles/cycle-17/phase-1-newtab-audit.md`](file:///c:/Users/Administrator/Desktop/Homebase/docs/cycles/cycle-17/phase-1-newtab-audit.md), the Widgets subsystem represents the most fragmented subsystem in terms of storage ownership and mixed presentation/networking logic.

---

## 2. Subsystem Candidate Evaluation

| Subsystem Candidate | Line Count & Hotspots | Complexity & Risk | Architectural Debt Addressed | Recommended Cycle Target |
|---|---|---|---|---|
| **A. Widgets Subsystem** | 3,529 lines across 6 files (`weather.js` 1,143 lines, `quote.js` 911 lines, `news.js` 816 lines) | **Medium Risk, High Reward**: Widgets are self-contained productivity cards with clear inputs and outputs. | Eliminates fragmented storage writes across 6 files; unifies fast-mirror synchronization; decouples network fetching from DOM card rendering. | **Primary Target for Cycle #17 (Recommended)** |
| **B. Bookmark Grid Tile Renderer** | 2,141 lines in `bookmark-grid-controller.js` | **High Risk**: Direct impact on first paint, virtualizer offsets, and SortableJS drag raycasting. | Decouples DOM tile synthesis from virtualized scroll controller. | Recommended for Cycle #18 |
| **C. Wallpaper Gallery Modal** | 2,986 lines in `gallery-ui.js` + 2,029 lines in `wallpaper-controller.js` | **High Complexity**: Cache API blobs, video playback, crossfading, tag filters. | Breaks down largest file in the repo. | Recommended for Cycle #19 |

---

## 3. Recommended Cycle #17 Focus: Widgets Subsystem Unification

### 3.1 Key Architectural Deficiencies in Widgets
1. **No Single Canonical Storage Owner**: Each widget file (`weather.js`, `quote.js`, `news.js`, `todo.js`, `time.js`, `widget-visibility.js`) implements its own fallback sequence:
   `HomebaseStorage.set` → `browser.storage.local.set` → `localStorage.setItem(fastMirror)`.
2. **Duplicated Preload Mirror Logic**: Writes to `fast-weather-v2`, `fast-quote-v2`, `fast-news-v2`, `fast-time-format`, and `fast-widget-order` are scattered across individual widget files instead of being coordinated by a central service.
3. **Monolithic Card Presentation**: `weather.js` and `news.js` inline extensive DOM element synthesis, SVG icon construction, and forecast layout into the same files that handle external HTTP API queries.

### 3.2 Target Cycle #17 Subsystem Architecture

```
┌────────────────────────────────────────────────────────┐
│                   Widgets Subsystem                    │
├────────────────────────────────────────────────────────┤
│  widget-storage.js (NEW - Canonical Storage Owner)     │
│  ├── Unified getWidgetState / setWidgetState           │
│  ├── Fast preload mirrors (fast-weather, fast-news...) │
│  ├── Widget order & visibility persistence             │
│  └── Defensive fallback to browser.storage.local       │
├────────────────────────────────────────────────────────┤
│  widget-card-renderer.js (NEW - Presentation Layer)    │
│  ├── Weather card, hourly scroll, 5-day forecast DOM   │
│  ├── News headline cards, source tags, image hydration │
│  └── Quote card layout and author formatting           │
├────────────────────────────────────────────────────────┤
│  weather.js (Coordinator / Service)                   │
│  └── Open-Meteo API query, geolocation, data caching   │
├────────────────────────────────────────────────────────┤
│  news.js (Coordinator / Service)                      │
│  └── RSS/JSON feed fetching, parsing, data caching     │
├────────────────────────────────────────────────────────┤
│  quote.js, todo.js, time.js, widget-visibility.js      │
│  └── Delegated storage and rendering                   │
└────────────────────────────────────────────────────────┘
```

---

## 4. Proposed Cycle #17 Phased Roadmap

### Phase 1: Subsystem Architecture Audit (Current)
- Complete read-only audit of `src/newtab/` and runtime pipeline.
- Produce `phase-1-newtab-audit.md` and `phase-1-plan.md`.
- Confirm 0 runtime diffs and passing test suite.

### Phase 2: Create Canonical Widget Storage Service (`widget-storage.js`)
- Create standalone `src/newtab/widgets/widget-storage.js`.
- Provide `window.HomebaseWidgetStorage` facade for:
  - Widget order preference (`widgetOrder`, fast mirror `fast-widget-order`)
  - Sidebar visibility (`sidebarVisibility`, fast mirror `fast-show-sidebar`)
  - Time format (`timeFormat`, fast mirror `fast-time-format`)
  - Weather cache & settings (`weatherCache`, `weatherSettings`)
  - Quote cache & index (`quoteCache`, `quoteIndex`)
  - News cache & settings (`newsCache`, `newsSettings`)
  - Todo state batch persistence (`todoItems`, `todoFilter`)
- Add comprehensive isolated unit tests in `tests/unit/widget-storage.test.mjs`.
- Register script in `src/new-tab.html` and `scripts/check-newtab-static.mjs`.

### Phase 3: Migrate Widgets to Canonical Storage Service
- Refactor `widget-visibility.js`, `time.js`, `todo.js`, `quote.js`, `weather.js`, `news.js` to delegate storage reads and writes to `HomebaseWidgetStorage`.
- Remove duplicated `browser.storage.local` fallback logic and ad-hoc `localStorage.setItem` mirror calls.
- Verify 100% backward compatibility for all existing unit tests.

### Phase 4: Create & Integrate Widget Card Renderer (or Stabilization)
- Extract weather and news DOM card synthesis into `HomebaseWidgetCardRenderer`.
- Decouple presentation from network services in `weather.js` and `news.js`.
- Run complete verification suite, audit memory leaks, and prepare commit.

---

## 5. Risk Assessment & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **Breaking Instant Pre-Hydration** | Low | High | Ensure all `localStorage` fast-mirror keys (`fast-show-sidebar`, `fast-widget-order`, `fast-time-format`, etc.) maintain exact JSON schemas and timing matching `src/preload.js` and `src/instant_load.js`. |
| **Offline Fallback Degradation** | Low | Medium | Defensive fallback to `browser.storage.local` and in-memory defaults preserved if `HomebaseStorage` is unavailable. |
| **Script Ordering & Invariant Collisions** | Low | High | Register `widget-storage.js` before individual widget scripts in `src/new-tab.html`. Verify static declarations with `check-newtab-static.mjs`. |
| **Unit Test Regressions** | Low | Medium | All 418 unit tests must pass continuously; add dedicated unit tests for new services prior to integration. |

---

## 6. Verification Standards
Every phase must pass:
1. `node --check <changed-files>`
2. `node scripts/check-newtab-static.mjs` (all deferred scripts verified, 0 collisions)
3. `npm.cmd test` (4/4 stages passed, 100% unit tests passed, smoke test passed on Edge)
4. `npm.cmd run build` (clean dual builds in `dist/chrome` and `dist/firefox`)
5. Protected files verification: `git diff src/preload.js src/instant_load.js manifests/ dist/` must be 0 diff.
