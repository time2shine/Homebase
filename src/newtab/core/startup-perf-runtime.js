const HB_PERF_DEBUG_KEY = 'homebasePerfDebug';
const HB_STARTUP_PERF_DEBUG_KEY = 'hbDebugStartupPerf';
const STARTUP_PERF_MAX_ENTRIES = 80;
const STARTUP_PERF_OVERLAY_EVENT_NAMES = new Set([
  'preload:start',
  'preload:initial-wallpaper-applied',
  'preload:async-wallpaper-applied',
  'newtab:init-start',
  'newtab:wallpaper-poster-applied',
  'newtab:video-load-called',
  'newtab:video-source-load-complete',
  'newtab:video-start-requested',
  'newtab:video-first-active',
  'newtab:crossfade-setup',
  'newtab:init-ready'
]);

const DEBUG_STARTUP_PERF = (() => {
  try {
    return (
      localStorage.getItem(HB_PERF_DEBUG_KEY) === '1' ||
      new URLSearchParams(window.location.search).has('perf')
    );
  } catch (_) {
    return false;
  }
})();

function getStartupPerfStore() {
  try {
    if (!Array.isArray(window.__HB_STARTUP_PERF)) {
      window.__HB_STARTUP_PERF = [];
    }
    return window.__HB_STARTUP_PERF;
  } catch (_) {
    return [];
  }
}

function sanitizeStartupPerfDetail(detail) {
  if (!detail || typeof detail !== 'object' || Array.isArray(detail)) return null;

  const safeDetail = {};

  Object.keys(detail).forEach((key) => {
    const value = detail[key];
    const keyName = String(key || '');
    const lowerKey = keyName.toLowerCase();

    if (/url|src|href|poster|video|blob/.test(lowerKey)) {
      safeDetail[keyName] = value ? 'present' : 'none';
      return;
    }

    if (typeof value === 'string') {
      if (/^(data:|blob:|https?:)/i.test(value)) {
        safeDetail[keyName] = 'present';
      } else {
        safeDetail[keyName] = value.slice(0, 80);
      }
      return;
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      safeDetail[keyName] = Math.round(value);
      return;
    }

    if (typeof value === 'boolean') {
      safeDetail[keyName] = value;
    }
  });

  return Object.keys(safeDetail).length ? safeDetail : null;
}

function recordStartupPerfEvent(name, detail) {
  try {
    const entryName = typeof name === 'string' && name ? name : 'unknown';
    const now =
      typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now();
    const entry = {
      name: entryName,
      time: Math.round(now)
    };
    const safeDetail = sanitizeStartupPerfDetail(detail);

    if (safeDetail) {
      entry.detail = safeDetail;
    }

    const entries = getStartupPerfStore();
    entries.push(entry);

    if (entries.length > STARTUP_PERF_MAX_ENTRIES) {
      entries.splice(0, entries.length - STARTUP_PERF_MAX_ENTRIES);
    }

    if (typeof performance !== 'undefined' && typeof performance.mark === 'function') {
      performance.mark(`hb:${entryName}`);
    }

    if (!DEBUG_STARTUP_PERF && entryName === 'newtab:init-ready') {
      recordStartupReadyMeasures();
    }
  } catch (_) {}
}

function recordStartupPerfEventOnce(name, detail) {
  try {
    if (typeof name !== 'string' || !name) return;
    const entries = getStartupPerfEntries();
    if (entries.some((entry) => entry && entry.name === name)) return;
    recordStartupPerfEvent(name, detail);
  } catch (_) {}
}

function recordStartupReadyMeasures() {
  try {
    if (typeof performance === 'undefined' || typeof performance.mark !== 'function') return;
    performance.mark('hb:ready-class');
    hbPerfMeasure('script-to-ready-class', 'script-start', 'ready-class');
    hbPerfMeasure('init-to-ready-class', 'init-start', 'ready-class');

    const afterPaint = () => {
      try {
        performance.mark('hb:after-ready-paint');
        hbPerfMeasure(
          'script-to-after-ready-paint',
          'script-start',
          'after-ready-paint'
        );
        hbPerfReport();
      } catch (_) {}
    };

    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => requestAnimationFrame(afterPaint));
    } else {
      setTimeout(afterPaint, 0);
    }
  } catch (_) {}
}

function getStartupPerfEntries() {
  try {
    return getStartupPerfStore()
      .filter((entry) => entry && typeof entry.name === 'string' && typeof entry.time === 'number')
      .map((entry) => ({
        name: entry.name,
        time: entry.time,
        detail: sanitizeStartupPerfDetail(entry.detail)
      }));
  } catch (_) {
    return [];
  }
}

function getStartupPerfTimelineRows(options = {}) {
  try {
    let rows = getStartupPerfEntries();

    if (!rows.length) return [];

    const firstTime = rows[0].time;
    rows = rows.map((entry) => ({
      name: entry.name,
      offsetMs: Math.max(0, Math.round(entry.time - firstTime)),
      time: entry.time,
      detail: entry.detail || null
    }));

    if (options && options.overlayOnly) {
      rows = rows.filter((row) => STARTUP_PERF_OVERLAY_EVENT_NAMES.has(row.name));
    }

    const limit = options && Number.isFinite(Number(options.limit)) ? Number(options.limit) : 0;
    if (limit > 0 && rows.length > limit) {
      rows = rows.slice(rows.length - limit);
    }

    return rows;
  } catch (_) {
    return [];
  }
}

function isStartupPerfDebugEnabled() {
  try {
    if (perfState && perfState.overlayEnabled === true) return true;
  } catch (_) {}

  try {
    if (debugPerfOverlayPreference === true) return true;
  } catch (_) {}

  try {
    return (
      localStorage.getItem(HB_PERF_DEBUG_KEY) === '1' ||
      localStorage.getItem(HB_STARTUP_PERF_DEBUG_KEY) === '1' ||
      new URLSearchParams(window.location.search).has('perf')
    );
  } catch (_) {
    return false;
  }
}

function formatStartupPerfTimelineLine(row) {
  if (!row) return '';
  return `+${Math.max(0, Math.round(row.offsetMs || 0))} ms ${row.name}`;
}

function formatOverlayStartupTimelineRows(rows, limit = 10) {
  try {
    if (!Array.isArray(rows) || !rows.length) return ['none recorded'];

    const compactRows = [];

    rows.forEach((row) => {
      if (!row || !row.name) return;

      if (row.name === 'newtab:video-load-called') {
        const existing = compactRows.find((item) => item.name === row.name);

        if (existing) {
          existing.count = (existing.count || 1) + 1;
          return;
        }
      }

      compactRows.push({ ...row, count: 1 });
    });

    const maxLines = Math.max(4, Math.min(10, Number(limit) || 10));
    let visibleRows = compactRows;
    let includeMoreLine = false;

    if (compactRows.length > maxLines) {
      const headCount = Math.min(4, maxLines - 2);
      const tailCount = Math.max(1, maxLines - headCount - 1);
      visibleRows = [
        ...compactRows.slice(0, headCount),
        ...compactRows.slice(compactRows.length - tailCount)
      ];
      includeMoreLine = true;
    }

    const lines = visibleRows.map((row) => {
      const countSuffix = row.count && row.count > 1 ? ` x${row.count}` : '';
      return `+${Math.max(0, Math.round(row.offsetMs || 0))} ${row.name}${countSuffix}`;
    });

    if (includeMoreLine) {
      lines.splice(Math.min(4, lines.length), 0, '+... more in Copy report');
    }

    return lines;
  } catch (_) {
    return ['none recorded'];
  }
}

function printStartupPerfReport() {
  const rows = getStartupPerfTimelineRows();

  if (typeof console === 'undefined') {
    return rows;
  }

  if (!rows.length) {
    if (typeof console.log === 'function') {
      console.log('[homebase startup perf] no startup timeline events recorded');
    }
    return rows;
  }

  const printableRows = rows.map((row) => ({
    offset: `+${Math.max(0, Math.round(row.offsetMs || 0))} ms`,
    event: row.name,
    detail: row.detail || ''
  }));

  if (typeof console.table === 'function') {
    console.table(printableRows);
  } else if (typeof console.log === 'function') {
    console.log('[homebase startup perf]', printableRows);
  }

  return rows;
}

window.hbPrintStartupPerf = printStartupPerfReport;

const DEBUG_IDLE_STARTUP = DEBUG_STARTUP_PERF;
const DEBUG_STARTUP_GUARDS = DEBUG_STARTUP_PERF;

const HB_DEBUG_LOGS_KEY = 'homebaseDebugLogs';

const DEBUG_HOMEBASE_LOGS = (() => {
  try {
    return (
      localStorage.getItem(HB_DEBUG_LOGS_KEY) === '1' ||
      localStorage.getItem(HB_PERF_DEBUG_KEY) === '1' ||
      new URLSearchParams(window.location.search).has('debug') ||
      new URLSearchParams(window.location.search).has('perf')
    );
  } catch (_) {
    return false;
  }
})();

function hbDebugLog(...args) {
  if (!DEBUG_HOMEBASE_LOGS) return;
  try {
    console.log(...args);
  } catch (_) {}
}

function hbDebugInfo(...args) {
  if (!DEBUG_HOMEBASE_LOGS) return;
  try {
    console.info(...args);
  } catch (_) {}
}

function hbPerfMark(name) {
  recordStartupPerfEvent(name);
}

function hbPerfMeasure(name, start, end) {
  try {
    if (typeof performance === 'undefined' || typeof performance.measure !== 'function') return;
    const measureName = `hb:${name}`;
    if (typeof performance.clearMeasures === 'function') {
      try { performance.clearMeasures(measureName); } catch (_) {}
    }
    performance.measure(measureName, `hb:${start}`, `hb:${end}`);
    const entries =
      typeof performance.getEntriesByName === 'function'
        ? performance.getEntriesByName(measureName, 'measure')
        : [];
    const entry = entries && entries.length ? entries[entries.length - 1] : null;
    const ms = entry && typeof entry.duration === 'number' ? entry.duration : null;
    const startMs = entry && typeof entry.startTime === 'number' ? entry.startTime : null;
    if (typeof ms === 'number' && Number.isFinite(ms)) {
      recordStartupPerfMeasure(measureName, ms);
      recordStartupPerfMeasureRow(measureName, ms, startMs);
    }
  } catch (_) {}
}

function hbPerfTime(label, startTime, extra) {
  try {
    if (typeof performance === 'undefined' || typeof performance.now !== 'function') return;
    const start = Number(startTime);
    if (!Number.isFinite(start) || start <= 0) return;
    const ms = performance.now() - start;
    if (!Number.isFinite(ms)) return;
    recordBookmarkPerfTiming(label, ms);
    recordRawPerfTiming(label, ms);
    const roundedMs = Math.round(ms * 100) / 100;
    if (!DEBUG_STARTUP_PERF) return;
    if (extra === undefined) {
      console.log('[homebase perf]', label, roundedMs, 'ms');
    } else {
      console.log('[homebase perf]', label, roundedMs, 'ms', extra);
    }
  } catch (_) {}
}

function hbPerfReport() {
  try {
    if (
      typeof performance === 'undefined' ||
      typeof performance.getEntriesByType !== 'function'
    ) return;
    const rowsByName = new Map();
    performance
      .getEntriesByType('measure')
      .filter(entry => entry && typeof entry.name === 'string' && entry.name.startsWith('hb:'))
      .forEach(entry => {
        rowsByName.set(entry.name, {
          measure: entry.name,
          ms: Math.round(entry.duration * 100) / 100,
          startMs: Math.round(entry.startTime * 100) / 100
        });
      });
    const rows = Array.from(rowsByName.values());
    if (!rows.length) return;
    rows.forEach(row => recordStartupPerfMeasure(row.measure, row.ms));
    rows.forEach(row => recordStartupPerfMeasureRow(row.measure, row.ms, row.startMs));
    perfState.startupRows = rows.map(row => ({
      measure: row.measure,
      ms: row.ms,
      startMs: row.startMs
    }));
    if (!DEBUG_STARTUP_PERF) return;
    if (typeof console !== 'undefined' && typeof console.table === 'function') {
      console.table(rows);
    } else if (typeof console !== 'undefined' && typeof console.log === 'function') {
      console.log('[homebase perf]', rows);
    }
  } catch (_) {}
}
