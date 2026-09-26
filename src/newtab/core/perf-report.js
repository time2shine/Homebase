const PERF_OVERLAY_CACHE_THROTTLE_MS = 5000;
const PERF_HEALTH_SESSION_KEY = 'homebasePerfHealthSession';

const SCRIPT_TIMING_TARGETS = [
  { label: 'script:instant-load', file: 'instant_load.js' },
  { label: 'script:sortable', file: 'Sortable.min.js' },
  { label: 'script:data', file: 'data.js' },
  { label: 'script:tips', file: 'tips.js' },
  { label: 'script:new-tab', file: 'new-tab.js' }
];

function createWidgetPerfState() {
  return {
    loadCachedWeather: { label: 'Weather cache', ms: null, status: 'pending' },
    setupWeather: { label: 'Weather', ms: null, status: 'pending' },
    setupSearch: { label: 'Search', ms: null, status: 'pending' },
    setupTodoWidget: { label: 'Todo', ms: null, status: 'pending' },
    setupNewsWidget: { label: 'News', ms: null, status: 'pending' },
    setupQuoteWidget: { label: 'Quote', ms: null, status: 'pending' },
    quoteIndex: { label: 'Quote index', ms: null, status: 'pending' },
    fetchQuote: { label: 'Quote fetch', ms: null, status: 'pending' },
    setupAppLauncher: { label: 'Apps', ms: null, status: 'pending' }
  };
}

function createSortablePerfState() {
  return {
    libraryAvailable: null,
    libraryChecked: false,
    libraryEventRecorded: '',
    grid: { label: 'Grid init', ms: null, status: 'skipped' },
    tabs: { label: 'Tabs init', ms: null, status: 'skipped' },
    widgets: { label: 'Widgets init', ms: null, status: 'skipped' },
    searchEngines: { label: 'Search engines init', ms: null, status: 'skipped' }
  };
}

function createHealthPerfState() {
  return {
    bookmarkFallbackUsed: false,
    galleryPosterCacheWarning: false,
    latestWarningMessage: null
  };
}

function createMediaPerfState() {
  return {
    lastObjectUrlCleanup: null,
    videoSkippedByPerformanceMode: false,
    videoSourcesClearedByPerformanceMode: false
  };
}

const perfState = {
  overlayEnabled: false,
  gridMode: 'idle',
  startup: {
    domContentLoadedMs: null,
    windowLoadMs: null,
    readyClassMs: null,
    afterReadyPaintMs: null,
    initToReadyClassMs: null,
    parallelStorageLoadsMs: null
  },
  bookmarks: {
    path: 'unknown',
    getSubTreeMs: null,
    getBookmarkTreeMs: null,
    metadataMs: null,
    processRenderMs: null,
    loadFunctionTotalMs: null,
    loadTotalMs: null,
    fallbackUsed: false
  },
  widgets: createWidgetPerfState(),
  sortable: createSortablePerfState(),
  health: createHealthPerfState(),
  warnings: [],
  startupRows: [],
  rawTimings: [],
  idleTasks: [],
  media: createMediaPerfState(),
  lastReportCopiedAt: null,
  lastReportCopyStatus: '',
  lastGridRenderMs: 0,
  lastRenderedStartIndex: -1,
  lastRenderedEndIndex: -1,
  totalCount: 0,
  gridRenderedNodes: 0,
  lastVirtualRange: { start: -1, end: -1 },
  cacheBytes: null,
  localStorageBytes: 0,
  lastCacheCheck: 0
};

let perfOverlayEl = null;
let perfOverlayInterval = null;
let perfOverlayCachePromise = null;


// Format bytes into a human readable string.
function formatBytes(bytes = 0) {

  if (!bytes || Number.isNaN(bytes)) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];

  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));

  const value = bytes / (1024 ** i);

  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[i]}`;

}

function formatPerfMs(value) {
  return typeof value === 'number' && Number.isFinite(value)
    ? `${Math.round(value)} ms`
    : '—';
}

function formatWidgetPerf(entry) {
  if (!entry) return '—';
  if (entry.status === 'skipped') return 'skipped';
  if (entry.status === 'failed') return 'failed';
  return formatPerfMs(entry.ms);
}

function getPerfTimestamp() {
  try {
    return new Date().toISOString();
  } catch (err) {
    return String(Date.now());
  }
}

/**
 * In-memory circular buffer for performance diagnostic metrics.
 * Capped at 20 records.
 */
const PERF_METRIC_BUFFER_MAX_SIZE = 20;
const perfMetricBuffer = [];

/**
 * Records a performance metric into the diagnostic buffer.
 * Capped at 20 entries.
 * Stores strictly { name, durationMs }.
 * Never stores page data, user data, or network information.
 *
 * @param {string|Object} nameOrObj
 * @param {number} [durationMs]
 * @returns {Object|null}
 */
function recordPerformanceMetric(nameOrObj, durationMs) {
  try {
    let name = 'unknown';
    let duration = 0;

    if (nameOrObj && typeof nameOrObj === 'object' && !Array.isArray(nameOrObj)) {
      name = typeof nameOrObj.name === 'string' ? nameOrObj.name.slice(0, 100) : 'unknown';
      duration = typeof nameOrObj.durationMs === 'number' && Number.isFinite(nameOrObj.durationMs)
        ? Math.max(0, Math.round(nameOrObj.durationMs))
        : 0;
    } else {
      name = typeof nameOrObj === 'string' ? nameOrObj.slice(0, 100) : 'unknown';
      duration = typeof durationMs === 'number' && Number.isFinite(durationMs)
        ? Math.max(0, Math.round(durationMs))
        : 0;
    }

    const metric = {
      name,
      durationMs: duration
    };

    perfMetricBuffer.push(metric);

    if (perfMetricBuffer.length > PERF_METRIC_BUFFER_MAX_SIZE) {
      perfMetricBuffer.shift();
    }

    return metric;
  } catch (_) {
    return null;
  }
}

/**
 * Returns a copy of the recorded performance metrics buffer.
 *
 * @returns {Array<Object>}
 */
function getPerformanceMetrics() {
  return [...perfMetricBuffer];
}

/**
 * Clears the performance metrics buffer.
 */
function clearPerformanceMetrics() {
  perfMetricBuffer.length = 0;
}

function recordRawPerfTiming(label, ms) {
  if (!Array.isArray(perfState.rawTimings)) {
    perfState.rawTimings = [];
  }

  perfState.rawTimings.push({
    label,
    ms,
    at: Date.now()
  });

  if (perfState.rawTimings.length > 80) {
    perfState.rawTimings.shift();
  }

  try {
    if (typeof label === 'string' && typeof ms === 'number' && Number.isFinite(ms)) {
      recordPerformanceMetric(label, ms);
    }
  } catch (_) {}
}

function recordIdleTaskPerf(name, status, ms = null) {
  if (!Array.isArray(perfState.idleTasks)) {
    perfState.idleTasks = [];
  }

  perfState.idleTasks.push({
    name,
    status,
    ms: typeof ms === 'number' && Number.isFinite(ms) ? ms : null,
    at: Date.now()
  });

  if (perfState.idleTasks.length > 120) {
    perfState.idleTasks.shift();
  }

  try {
    if (typeof name === 'string' && typeof ms === 'number' && Number.isFinite(ms)) {
      recordPerformanceMetric(`idle:${name}`, ms);
    }
  } catch (_) {}
}

function recordObjectUrlCleanup(details) {
  if (!perfState.media) {
    perfState.media = createMediaPerfState();
  }

  perfState.media.lastObjectUrlCleanup = {
    at: Date.now(),
    videoUrlActive: Boolean(details && details.videoUrl),
    videoCacheKey: details && details.videoCacheKey ? 'present' : 'none',
    cacheEntriesCount: Array.isArray(details && details.cacheEntries)
      ? details.cacheEntries.length
      : null
  };
}

function recordWidgetPerfTiming(key, ms, status = 'done') {
  if (!perfState.widgets || !perfState.widgets[key]) return;

  perfState.widgets[key].ms =
    typeof ms === 'number' && Number.isFinite(ms) ? ms : null;
  perfState.widgets[key].status = status || 'done';

  try {
    if (typeof key === 'string' && typeof ms === 'number' && Number.isFinite(ms)) {
      recordPerformanceMetric(`widget:${key}`, ms);
    }
  } catch (_) {}

  if (perfState.overlayEnabled) {
    updatePerfOverlay(false);
  }
}

function getPerfMeasureStart() {
  try {
    return typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
  } catch (_) {
    return Date.now();
  }
}

function recordSortableLibraryAvailability() {
  try {
    if (!perfState.sortable) {
      perfState.sortable = createSortablePerfState();
    }

    const isAvailable = typeof Sortable !== 'undefined';
    const eventName = isAvailable ? 'sortable:library-available' : 'sortable:library-missing';

    perfState.sortable.libraryAvailable = isAvailable;
    perfState.sortable.libraryChecked = true;

    if (perfState.sortable.libraryEventRecorded !== eventName) {
      perfState.sortable.libraryEventRecorded = eventName;
      recordStartupPerfEvent(eventName);
    }

    return isAvailable;
  } catch (_) {
    return false;
  }
}

function getSortablePerfEventKey(key) {
  return key === 'searchEngines' ? 'search-engines' : key;
}

function recordSortablePerfTiming(key, startTime, status = 'done') {
  try {
    if (!perfState.sortable) {
      perfState.sortable = createSortablePerfState();
    }

    const entry = perfState.sortable[key];
    if (!entry) return;

    const end = getPerfMeasureStart();
    const start = Number(startTime);
    const ms = Number.isFinite(start) ? Math.max(0, end - start) : null;

    entry.ms = typeof ms === 'number' && Number.isFinite(ms) ? ms : null;
    entry.status = status || 'done';

    recordStartupPerfEvent(`sortable:${getSortablePerfEventKey(key)}-init`, {
      ms: entry.ms,
      status: entry.status
    });
  } catch (_) {}
}

function getScriptTimingRows() {
  try {
    if (
      typeof performance === 'undefined' ||
      typeof performance.getEntriesByType !== 'function'
    ) {
      return SCRIPT_TIMING_TARGETS.map((target) => ({
        label: target.label,
        status: 'unavailable',
        durationMs: null,
        startMs: null
      }));
    }

    const resources = performance.getEntriesByType('resource') || [];

    return SCRIPT_TIMING_TARGETS.map((target) => {
      const match = resources.find((entry) => {
        try {
          if (!entry || typeof entry.name !== 'string') return false;
          const url = new URL(entry.name, window.location.href);
          return url.pathname.endsWith(`/${target.file}`) || url.pathname.endsWith(target.file);
        } catch (_) {
          return entry && typeof entry.name === 'string' && entry.name.endsWith(target.file);
        }
      });

      if (!match) {
        return {
          label: target.label,
          status: 'not recorded',
          durationMs: null,
          startMs: null
        };
      }

      return {
        label: target.label,
        status: 'recorded',
        durationMs: typeof match.duration === 'number' ? match.duration : null,
        startMs: typeof match.startTime === 'number' ? match.startTime : null
      };
    });
  } catch (_) {
    return [];
  }
}

function readPerfHealthSession() {
  try {
    if (!window.sessionStorage) return null;
    const raw = sessionStorage.getItem(PERF_HEALTH_SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}

function writePerfHealthSession() {
  try {
    if (!window.sessionStorage || !perfState.health) return;
    sessionStorage.setItem(PERF_HEALTH_SESSION_KEY, JSON.stringify({
      health: perfState.health,
      warnings: Array.isArray(perfState.warnings) ? perfState.warnings : []
    }));
  } catch (err) {
    // Best-effort perf debug state only.
  }
}

function restorePerfHealthSession() {
  const stored = readPerfHealthSession();
  if (!stored) return;

  if (stored.health) {
    perfState.health = {
      ...createHealthPerfState(),
      ...stored.health
    };
  }

  if (Array.isArray(stored.warnings)) {
    perfState.warnings = stored.warnings;
  }
}

function clearPerfHealthSession() {
  try {
    if (window.sessionStorage) {
      sessionStorage.removeItem(PERF_HEALTH_SESSION_KEY);
    }
  } catch (err) {
    // Best-effort perf debug state only.
  }
}

function recordPerfWarning(key, message) {
  if (!key || !message) return;

  if (!perfState.health) {
    perfState.health = createHealthPerfState();
  }
  perfState.health.latestWarningMessage = message;

  if (!Array.isArray(perfState.warnings)) {
    perfState.warnings = [];
  }

  const existing = perfState.warnings.find((warning) => warning.key === key);
  if (existing) {
    existing.count = (existing.count || 1) + 1;
    existing.message = message;
    existing.lastAt = Date.now();
  } else {
    perfState.warnings.push({
      key,
      message,
      count: 1,
      firstAt: Date.now(),
      lastAt: Date.now()
    });
  }

  writePerfHealthSession();

  if (perfState.overlayEnabled) {
    updatePerfOverlay(false);
  }
}

function recordPerfFallback(type, message) {
  if (!perfState.health) {
    perfState.health = createHealthPerfState();
  }

  if (type === 'bookmarks') {
    perfState.health.bookmarkFallbackUsed = true;
  }

  if (type === 'galleryPosters') {
    perfState.health.galleryPosterCacheWarning = true;
  }

  if (message) {
    perfState.health.latestWarningMessage = message;
  }

  writePerfHealthSession();

  recordPerfWarning(`${type}-fallback`, message || `${type} fallback used`);
}

function getLatestPerfWarningMessage() {
  if (perfState.health && perfState.health.latestWarningMessage) {
    return perfState.health.latestWarningMessage;
  }

  if (!Array.isArray(perfState.warnings) || !perfState.warnings.length) {
    return null;
  }

  const latest = perfState.warnings.reduce((latestWarning, warning) => {
    if (!latestWarning) return warning;
    return (warning.lastAt || 0) > (latestWarning.lastAt || 0)
      ? warning
      : latestWarning;
  }, null);

  return latest ? latest.message : null;
}

function getPerfFallbackSummary() {
  const fallbacks = [];

  if (
    (perfState.health && perfState.health.bookmarkFallbackUsed) ||
    (perfState.bookmarks && perfState.bookmarks.fallbackUsed)
  ) {
    fallbacks.push('Bookmarks');
  }

  if (perfState.health && perfState.health.galleryPosterCacheWarning) {
    fallbacks.push('Gallery posters');
  }

  return fallbacks.length ? fallbacks.join(', ') : 'None';
}

function recordStartupPerfMeasure(name, ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return;

  try {
    switch (name) {
      case 'hb:script-to-dom-content-loaded':
      case 'script-to-dom-content-loaded':
        perfState.startup.domContentLoadedMs = ms;
        break;
      case 'hb:script-to-window-load':
      case 'script-to-window-load':
        perfState.startup.windowLoadMs = ms;
        break;
      case 'hb:script-to-ready-class':
      case 'script-to-ready-class':
        perfState.startup.readyClassMs = ms;
        break;
      case 'hb:script-to-after-ready-paint':
      case 'script-to-after-ready-paint':
        perfState.startup.afterReadyPaintMs = ms;
        break;
      case 'hb:init-to-ready-class':
      case 'init-to-ready-class':
        perfState.startup.initToReadyClassMs = ms;
        break;
      case 'hb:parallel-storage-loads':
      case 'parallel-storage-loads':
        perfState.startup.parallelStorageLoadsMs = ms;
        break;
      default:
        break;
    }
  } catch (_) {}
}

function recordStartupPerfMeasureRow(name, ms, startMs = null) {
  if (typeof name !== 'string' || !name) return;
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return;

  try {
    if (!Array.isArray(perfState.startupRows)) {
      perfState.startupRows = [];
    }

    const measureName = name.startsWith('hb:') ? name : `hb:${name}`;
    const row = {
      measure: measureName,
      ms: Math.round(ms * 100) / 100,
      startMs: typeof startMs === 'number' && Number.isFinite(startMs)
        ? Math.round(startMs * 100) / 100
        : null
    };
    const existingIndex = perfState.startupRows.findIndex((entry) => entry.measure === measureName);

    if (existingIndex >= 0) {
      perfState.startupRows[existingIndex] = row;
    } else {
      perfState.startupRows.push(row);
    }

    if (perfState.startupRows.length > 40) {
      perfState.startupRows.splice(0, perfState.startupRows.length - 40);
    }
  } catch (_) {}
}

function recordBookmarkPerfTiming(label, ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return;

  try {
    recordPerformanceMetric(`bookmark:${label}`, ms);
  } catch (_) {}

  try {
    switch (label) {
      case 'loadFolderMetadata':
        perfState.bookmarks.metadataMs = ms;
        break;
      case 'bookmarks getSubTree':
        perfState.bookmarks.getSubTreeMs = ms;
        if (perfState.bookmarks.path !== 'fallback') {
          perfState.bookmarks.path = 'getSubTree';
        }
        break;
      case 'bookmarks getBookmarkTree':
        perfState.bookmarks.getBookmarkTreeMs = ms;
        if (perfState.bookmarks.getSubTreeMs !== null) {
          perfState.bookmarks.path = 'fallback';
          perfState.bookmarks.fallbackUsed = true;
          recordPerfFallback('bookmarks', 'Bookmark root recovered');
        } else {
          perfState.bookmarks.path = 'getBookmarkTree';
        }
        break;
      case 'bookmarks process/render request':
        perfState.bookmarks.processRenderMs = ms;
        break;
      case 'loadBookmarks function total':
        perfState.bookmarks.loadFunctionTotalMs = ms;
        break;
      case 'loadBookmarks total':
        perfState.bookmarks.loadTotalMs = ms;
        break;
      default:
        break;
    }
  } catch (_) {}
}

function formatReportValue(value) {
  return value === null || value === undefined || value === '' ? '—' : String(value);
}

function recordPerformanceModeVideoSkipped() {
  try {
    if (!perfState.media) perfState.media = createMediaPerfState();
    if (!perfState.media.videoSkippedByPerformanceMode) {
      recordStartupPerfEvent('newtab:video-skipped-performance-mode');
    }
    perfState.media.videoSkippedByPerformanceMode = true;
  } catch (_) {}
}

function isPerformanceModeVideoSkippedForReport() {
  if (!appPerformanceModePreference) return false;

  try {
    if (perfState.media && perfState.media.videoSkippedByPerformanceMode) return true;
    if (getStartupPerfEntries().some((entry) => entry.name === 'newtab:video-skipped-performance-mode')) return true;
    if (wallpaperTypePreference === 'video') return true;
    if (currentWallpaperSelection && currentWallpaperSelection.videoUrl) return true;
    return !!(lastAppliedWallpaper && lastAppliedWallpaper.type === 'video' && lastAppliedWallpaper.video);
  } catch (_) {
    return false;
  }
}

function formatSortablePerfEntry(entry) {
  if (!entry) return 'skipped';
  if (entry.status && entry.status !== 'done') return entry.status;
  return formatPerfMs(entry.ms);
}

function buildFullPerfReport() {
  const lines = [];
  const bookmarkLoadMs =
    perfState.bookmarks.loadTotalMs ??
    perfState.bookmarks.loadFunctionTotalMs;

  lines.push('Homebase Full Performance Report');
  lines.push(`Generated: ${getPerfTimestamp()}`);
  lines.push('');

  lines.push('Summary');
  lines.push(`Ready: ${formatPerfMs(perfState.startup.readyClassMs)}`);
  lines.push(`After paint: ${formatPerfMs(perfState.startup.afterReadyPaintMs)}`);
  lines.push(`Storage: ${formatPerfMs(perfState.startup.parallelStorageLoadsMs)}`);
  lines.push(`Bookmark path: ${perfState.bookmarks.path}`);
  lines.push(`Bookmark load: ${formatPerfMs(bookmarkLoadMs)}`);
  lines.push(`Bookmark fallback: ${perfState.bookmarks.fallbackUsed ? 'Yes' : 'No'}`);
  lines.push(`Performance Mode: ${appPerformanceModePreference ? 'On' : 'Off'}`);
  lines.push(`Console debug: ${DEBUG_STARTUP_PERF ? 'On' : 'Off'}`);
  lines.push('');

  lines.push('Startup Measures');
  if (Array.isArray(perfState.startupRows) && perfState.startupRows.length) {
    perfState.startupRows.forEach((row) => {
      lines.push(`- ${row.measure}: ${formatPerfMs(row.ms)} @ ${formatPerfMs(row.startMs)}`);
    });
  } else {
    lines.push('- none recorded');
  }
  lines.push('');

  lines.push('Startup Timeline');
  const startupTimelineRows = getStartupPerfTimelineRows();
  if (startupTimelineRows.length) {
    startupTimelineRows.forEach((row) => {
      lines.push(`- ${formatStartupPerfTimelineLine(row)}`);
    });
  } else {
    lines.push('- none recorded');
  }
  lines.push('');

  lines.push('Sortable');
  const sortablePerf = perfState.sortable || createSortablePerfState();
  lines.push(`- Library available: ${sortablePerf.libraryAvailable === true ? 'Yes' : (sortablePerf.libraryAvailable === false ? 'No' : 'Unknown')}`);
  lines.push(`- Grid init: ${formatSortablePerfEntry(sortablePerf.grid)}`);
  lines.push(`- Tabs init: ${formatSortablePerfEntry(sortablePerf.tabs)}`);
  lines.push(`- Widgets init: ${formatSortablePerfEntry(sortablePerf.widgets)}`);
  lines.push(`- Search engines init: ${formatSortablePerfEntry(sortablePerf.searchEngines)}`);
  lines.push('');

  lines.push('Script Timing');
  const scriptTimingRows = getScriptTimingRows();
  if (scriptTimingRows.length) {
    scriptTimingRows.forEach((row) => {
      const timing =
        row.status === 'recorded'
          ? `${formatPerfMs(row.durationMs)} @ +${formatPerfMs(row.startMs)}`
          : row.status;
      lines.push(`- ${row.label}: ${timing}`);
    });
  } else {
    lines.push('- none recorded');
  }
  lines.push('');

  lines.push('Bookmarks');
  lines.push(`- Path: ${perfState.bookmarks.path}`);
  lines.push(`- getSubTree: ${formatPerfMs(perfState.bookmarks.getSubTreeMs)}`);
  lines.push(`- getBookmarkTree: ${formatPerfMs(perfState.bookmarks.getBookmarkTreeMs)}`);
  lines.push(`- Metadata: ${formatPerfMs(perfState.bookmarks.metadataMs)}`);
  lines.push(`- Process/render request: ${formatPerfMs(perfState.bookmarks.processRenderMs)}`);
  lines.push(`- Load function total: ${formatPerfMs(perfState.bookmarks.loadFunctionTotalMs)}`);
  lines.push(`- Load total: ${formatPerfMs(perfState.bookmarks.loadTotalMs)}`);
  lines.push(`- Fallback used: ${perfState.bookmarks.fallbackUsed ? 'Yes' : 'No'}`);
  lines.push('');

  lines.push('Grid');
  lines.push(`- Mode: ${perfState.gridMode}`);
  lines.push(`- Render: ${formatPerfMs(perfState.lastGridRenderMs)}`);
  lines.push(`- Nodes: ${perfState.gridRenderedNodes}`);
  lines.push(`- Total count: ${perfState.totalCount}`);
  lines.push(`- Range: ${perfState.lastRenderedStartIndex}-${perfState.lastRenderedEndIndex}`);
  lines.push('');

  lines.push('Widgets');
  Object.keys(perfState.widgets || {}).forEach((key) => {
    const entry = perfState.widgets[key];
    if (!entry) return;
    lines.push(`- ${entry.label}: ${formatWidgetPerf(entry)}`);
  });
  lines.push('');

  lines.push('Health');
  lines.push(`- Warnings: ${Array.isArray(perfState.warnings) ? perfState.warnings.length : 0}`);
  lines.push(`- Fallbacks: ${getPerfFallbackSummary()}`);
  const latestWarning = getLatestPerfWarningMessage();
  lines.push(`- Latest: ${latestWarning || 'None'}`);
  if (Array.isArray(perfState.warnings) && perfState.warnings.length) {
    perfState.warnings.forEach((warning) => {
      lines.push(`  - ${warning.key}: ${warning.message} x${warning.count || 1}`);
    });
  }
  lines.push('');

  lines.push('Raw Timings');
  if (Array.isArray(perfState.rawTimings) && perfState.rawTimings.length) {
    perfState.rawTimings.forEach((event) => {
      lines.push(`- ${event.label}: ${formatPerfMs(event.ms)}`);
    });
  } else {
    lines.push('- none recorded');
  }
  lines.push('');

  lines.push('Startup Idle Tasks');
  if (Array.isArray(perfState.idleTasks) && perfState.idleTasks.length) {
    perfState.idleTasks.forEach((task) => {
      const suffix = typeof task.ms === 'number' ? ` ${formatPerfMs(task.ms)}` : '';
      lines.push(`- ${task.name}: ${task.status}${suffix}`);
    });
  } else {
    lines.push('- none recorded');
  }
  lines.push('');

  lines.push('Cache / Storage');
  lines.push(`- Cache size: ${perfState.cacheBytes === null ? 'calculating' : formatBytes(perfState.cacheBytes)}`);
  lines.push(`- localStorage: ${formatBytes(perfState.localStorageBytes)}`);
  lines.push('');

  lines.push('Media');
  const mediaState = perfState.media || createMediaPerfState();
  const mediaCleanup = mediaState.lastObjectUrlCleanup;
  const videoSkippedByPerformanceMode = isPerformanceModeVideoSkippedForReport();

  if (videoSkippedByPerformanceMode) {
    lines.push('- Performance Mode video playback: disabled');
    lines.push('- Video skipped by Performance Mode: Yes');
    lines.push('- Object URL cleanup: not needed / skipped by Performance Mode');
  }

  if (mediaCleanup) {
    const cleanup = mediaCleanup;
    lines.push(`- Object URL cleanup seen: Yes`);
    lines.push(`- Active video URL: ${cleanup.videoUrlActive ? 'Yes' : 'No'}`);
    lines.push(`- Video cache key: ${cleanup.videoCacheKey}`);
    lines.push(`- Cache entries count: ${formatReportValue(cleanup.cacheEntriesCount)}`);
  } else if (!videoSkippedByPerformanceMode) {
    lines.push('- Object URL cleanup seen: No');
  }
  lines.push('');

  lines.push('Environment');
  lines.push(`- User agent: ${navigator.userAgent || 'unknown'}`);
  lines.push(`- Platform: ${navigator.platform || 'unknown'}`);
  lines.push(`- Viewport: ${window.innerWidth}x${window.innerHeight}`);
  lines.push(`- Device pixel ratio: ${window.devicePixelRatio || 1}`);
  lines.push(`- Reduced motion: ${window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'Yes' : 'No'}`);
  lines.push('');

  lines.push('Privacy');
  lines.push('- Report excludes bookmark titles, URLs, todo text, search content, weather location, and full wallpaper/video/blob URLs.');

  return lines.join('\n');
}

async function copyFullPerfReport() {
  const report = buildFullPerfReport();

  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(report);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = report;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }

    perfState.lastReportCopiedAt = Date.now();
    perfState.lastReportCopyStatus = 'Copied';
  } catch (err) {
    perfState.lastReportCopyStatus = 'Copy failed';
    console.warn('Failed to copy perf report', err);
  }

  if (perfState.overlayEnabled) {
    updatePerfOverlay(false);
  }
}

// Estimate localStorage usage in bytes.
function estimateLocalStorageBytes() {

  let total = 0;

  try {

    for (let i = 0; i < localStorage.length; i++) {

      const key = localStorage.key(i) || '';

      const val = localStorage.getItem(key) || '';

      total += (key.length + val.length) * 2;

    }

  } catch (err) {

    console.warn('Failed to estimate localStorage size', err);

  }

  return total;

}

// Throttled cache size computation for the perf overlay.
async function computeCacheBytes() {

  const cacheNames = new Set([WALLPAPER_CACHE_NAME, GALLERY_POSTERS_CACHE_NAME]);

  try {

    const myWallpapersCache = (() => {

      try {

        if (typeof MyWallpapers !== 'undefined' && MyWallpapers && typeof MyWallpapers.getCacheName === 'function') {

          return MyWallpapers.getCacheName();

        }

      } catch (err) {

        return null;

      }

      return null;

    })();

    if (myWallpapersCache) cacheNames.add(myWallpapersCache);

  } catch (err) {

    // Ignore—MyWallpapers may not be initialized yet.

  }

  let totalBytes = 0;

  for (const name of cacheNames) {

    if (!name) continue;

    try {

      const cache = await caches.open(name);

      const requests = await cache.keys();

      for (const request of requests) {

        const res = await cache.match(request);

        if (!res) continue;

        const len = res.headers.get('content-length');

        const parsed = len ? parseInt(len, 10) : NaN;

        if (!Number.isNaN(parsed)) {

          totalBytes += parsed;

          continue;

        }

        if (res.type === 'opaque') continue;

        try {

          const buf = await res.clone().arrayBuffer();

          totalBytes += buf.byteLength;

        } catch (err) {

          // Ignore failures from unreadable responses.

        }

      }

    } catch (err) {

      console.warn('Perf overlay cache size check failed for', name, err);

    }

  }

  perfState.cacheBytes = totalBytes;

  return totalBytes;

}

function ensurePerfOverlayElement() {

  if (perfOverlayEl && perfOverlayEl.isConnected) return perfOverlayEl;

  const el = document.createElement('div');

  el.id = 'perf-debug-overlay';

  el.style.cssText = `
    position: fixed;
    left: auto;
    --hb-perf-overlay-edge-offset: 16px;
    --hb-right-dock-width: 0px;
    --hb-perf-overlay-dock-gap: 16px;
    --hb-perf-overlay-right-offset: var(--hb-perf-overlay-edge-offset);
    right: var(--hb-perf-overlay-right-offset, 16px);
    bottom: 12px;
    box-sizing: border-box;
    background: rgba(0,0,0,0.78);
    color: #fff;
    padding: 10px 12px;
    border-radius: 8px;
    font-size: 12px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", "Courier New", monospace;
    line-height: 1.5;
    pointer-events: auto;
    z-index: 9999;
    box-shadow: 0 8px 24px rgba(0,0,0,0.35);
    width: max-content;
    max-width: min(520px, calc(100vw - var(--hb-perf-overlay-right-offset, 16px) - 16px));
    max-height: calc(100vh - 24px);
    overflow-y: auto;
    overflow-x: hidden;
    overflow-wrap: anywhere;
    word-break: break-word;
    display: flex;
    flex-direction: column;
    gap: 8px;
  `;

  const textEl = document.createElement('div');
  textEl.dataset.role = 'perf-overlay-text';
  textEl.style.cssText = `
    white-space: pre-wrap;
    pointer-events: none;
    overflow-wrap: anywhere;
    word-break: break-word;
  `;

  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.dataset.role = 'perf-copy-report';
  copyBtn.textContent = 'Copy report';
  copyBtn.style.cssText = `
    align-self: flex-start;
    border: 1px solid rgba(255,255,255,0.28);
    border-radius: 6px;
    background: rgba(255,255,255,0.12);
    color: #fff;
    font: inherit;
    font-size: 11px;
    line-height: 1.2;
    padding: 4px 7px;
    cursor: pointer;
    flex-shrink: 0;
  `;
  copyBtn.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    copyFullPerfReport();
  });

  el.appendChild(textEl);
  el.appendChild(copyBtn);

  perfOverlayEl = el;

  const attach = () => {

    if (document && document.body && !el.isConnected) {

      document.body.appendChild(el);

    } else {

      requestAnimationFrame(attach);

    }

  };

  attach();

  return el;

}

function updatePerfOverlayDockOffset(el) {
  if (!el || !el.style) return;

  let dockWidth = 0;

  try {
    const dockEl = dock || document.querySelector('.dock');

    if (dockEl) {
      const style = window.getComputedStyle ? window.getComputedStyle(dockEl) : null;
      const rect = dockEl.getBoundingClientRect();
      const isVisible =
        dockEl.offsetParent !== null &&
        rect &&
        rect.width > 0 &&
        rect.height > 0 &&
        (!style || (style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0'));

      if (isVisible) {
        dockWidth = Math.round(rect.width);
      }
    }
  } catch (e) {
    dockWidth = 0;
  }

  const gap = dockWidth > 0 ? 16 : 0;
  const rightOffset = dockWidth > 0 ? dockWidth + gap : 16;

  el.style.setProperty('--hb-right-dock-width', `${dockWidth}px`);
  el.style.setProperty('--hb-perf-overlay-dock-gap', `${gap}px`);
  el.style.setProperty('--hb-perf-overlay-right-offset', `${rightOffset}px`);
}

function updatePerfOverlay(forceCacheRefresh = false) {

  if (!perfState.overlayEnabled) return;

  const el = ensurePerfOverlayElement();
  updatePerfOverlayDockOffset(el);

  const now = Date.now();

  if ((forceCacheRefresh || now - perfState.lastCacheCheck >= PERF_OVERLAY_CACHE_THROTTLE_MS) && !perfOverlayCachePromise) {

    perfState.lastCacheCheck = now;

    perfOverlayCachePromise = computeCacheBytes().catch(() => {}).finally(() => {

      perfOverlayCachePromise = null;

      if (perfState.overlayEnabled) updatePerfOverlay(false);

    });

  }

  perfState.localStorageBytes = estimateLocalStorageBytes();

  const cacheDisplay = perfState.cacheBytes != null ? formatBytes(perfState.cacheBytes) : '...';

  const startupTimelineLines = formatOverlayStartupTimelineRows(
    getStartupPerfTimelineRows({ overlayOnly: true }),
    10
  );

  const summaryLines = [
    'Summary',
    `Ready: ${formatPerfMs(perfState.startup.readyClassMs)}`,
    `Paint: ${formatPerfMs(perfState.startup.afterReadyPaintMs)}`,
    `Storage: ${formatPerfMs(perfState.startup.parallelStorageLoadsMs)}`,
    `Performance: ${appPerformanceModePreference ? 'On' : 'Off'}`
  ];

  const startupLines = [
    'Startup Timeline',
    ...startupTimelineLines
  ];

  const bookmarkLoadMs =
    perfState.bookmarks.loadTotalMs ??
    perfState.bookmarks.loadFunctionTotalMs;

  const bookmarkLines = [
    'Bookmarks',
    `Path: ${perfState.bookmarks.path}`,
    `Load: ${formatPerfMs(bookmarkLoadMs)}`,
    `Metadata: ${formatPerfMs(perfState.bookmarks.metadataMs)}`,
    `Fallback: ${perfState.bookmarks.fallbackUsed ? 'Yes' : 'No'}`
  ];

  const latestWarning = getLatestPerfWarningMessage();
  const healthLines = [
    'Health',
    `Warnings: ${Array.isArray(perfState.warnings) ? perfState.warnings.length : 0}`,
    `Fallbacks: ${getPerfFallbackSummary()}`
  ];

  if (latestWarning) {
    healthLines.push(`Latest: ${latestWarning}`);
  }

  const mediaState = perfState.media || createMediaPerfState();
  const mediaCleanup = mediaState.lastObjectUrlCleanup;
  const videoSkippedByPerformanceMode = isPerformanceModeVideoSkippedForReport();
  const mediaLines = [
    'Media'
  ];

  if (videoSkippedByPerformanceMode) {
    mediaLines.push('Performance Mode video: disabled');
    mediaLines.push('Video skipped: Yes');
    mediaLines.push('Object URLs: not needed');
  } else {
    mediaLines.push(`Object URLs: ${mediaCleanup ? 'cleaned' : 'not seen'}`);
  }

  if (mediaCleanup) {
    mediaLines.push(`Active video: ${mediaCleanup.videoUrlActive ? 'Yes' : 'No'}`);
  }

  const cacheLines = [
    'Cache',
    `Cache: ${cacheDisplay}`,
    `localStorage: ${formatBytes(perfState.localStorageBytes)}`
  ];

  const reportLines = perfState.lastReportCopyStatus
    ? [`Report: ${perfState.lastReportCopyStatus}`]
    : [];

  const overlayText = [
    'Homebase Perf',
    '',
    ...summaryLines,
    '',
    ...startupLines,
    '',
    ...bookmarkLines,
    '',
    ...healthLines,
    '',
    ...mediaLines,
    '',
    ...cacheLines,
    ...(reportLines.length ? ['', ...reportLines] : [])
  ].join('\n');

  const textEl = el.querySelector('[data-role="perf-overlay-text"]');
  if (textEl) {
    textEl.textContent = overlayText;
  } else {
    el.textContent = overlayText;
  }

}

function setPerfOverlayEnabled(enabled) {

  const isEnabled = enabled === true;

  perfState.overlayEnabled = isEnabled;

  debugPerfOverlayPreference = isEnabled;

  if (isEnabled) {

    restorePerfHealthSession();

    ensurePerfOverlayElement();

    updatePerfOverlay(true);

    if (!perfOverlayInterval) {

      perfOverlayInterval = setInterval(() => updatePerfOverlay(false), 1000);

    }

  } else {

    if (perfOverlayInterval) {

      clearInterval(perfOverlayInterval);

      perfOverlayInterval = null;

    }

    if (perfOverlayEl) {

      perfOverlayEl.remove();

    }

    perfOverlayEl = null;

    perfState.gridMode = 'idle';
    perfState.startup = {
      domContentLoadedMs: null,
      windowLoadMs: null,
      readyClassMs: null,
      afterReadyPaintMs: null,
      initToReadyClassMs: null,
      parallelStorageLoadsMs: null
    };
    perfState.bookmarks = {
      path: 'unknown',
      getSubTreeMs: null,
      getBookmarkTreeMs: null,
      metadataMs: null,
      processRenderMs: null,
      loadFunctionTotalMs: null,
      loadTotalMs: null,
      fallbackUsed: false
    };
    perfState.widgets = createWidgetPerfState();
    perfState.sortable = createSortablePerfState();
    perfState.health = createHealthPerfState();
    perfState.warnings = [];
    clearPerfHealthSession();
    perfState.startupRows = [];
    perfState.rawTimings = [];
    perfState.idleTasks = [];
    perfState.media = createMediaPerfState();
    perfState.lastReportCopiedAt = null;
    perfState.lastReportCopyStatus = '';
    perfState.gridRenderedNodes = 0;
    perfState.lastRenderedStartIndex = -1;
    perfState.lastRenderedEndIndex = -1;
    perfState.lastVirtualRange = { start: -1, end: -1 };
    perfState.totalCount = 0;
    perfState.lastGridRenderMs = 0;

  }

}

// Register performance diagnostics and anomaly adapter
if (typeof window !== 'undefined') {
  window.HomebaseDiagnostics = window.HomebaseDiagnostics || {};

  // If storage-diagnostics.js is loaded, wrap recordValidationAnomaly to accept { key, action, category }
  const existingRecordAnomaly = window.HomebaseDiagnostics.recordValidationAnomaly;
  if (typeof existingRecordAnomaly === 'function') {
    window.HomebaseDiagnostics.recordValidationAnomaly = function(keyOrRecord, action, category) {
      if (keyOrRecord && typeof keyOrRecord === 'object' && !Array.isArray(keyOrRecord)) {
        return existingRecordAnomaly(
          keyOrRecord.key || 'unknown',
          keyOrRecord.action || keyOrRecord.category || 'unspecified',
          keyOrRecord.category || keyOrRecord.detail || null
        );
      }
      return existingRecordAnomaly(keyOrRecord, action, category);
    };
    window.recordValidationAnomaly = window.HomebaseDiagnostics.recordValidationAnomaly;
  }

  window.HomebaseDiagnostics.recordPerformanceMetric = recordPerformanceMetric;
  window.HomebaseDiagnostics.getPerformanceMetrics = getPerformanceMetrics;
  window.HomebaseDiagnostics.clearPerformanceMetrics = clearPerformanceMetrics;
  window.recordPerformanceMetric = recordPerformanceMetric;
  window.getPerformanceMetrics = getPerformanceMetrics;
}



