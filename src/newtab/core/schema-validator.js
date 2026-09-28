// ===============================================
// Homebase — Storage Schema Validation Architecture
// ===============================================


/**
 * Validates whether a value is a valid 3 or 6 character hexadecimal color code.
 *
 * @param {*} value
 * @returns {boolean}
 */
function isValidHexColor(value) {
  if (typeof value !== 'string') return false;
  return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(value.trim());
}

/**
 * Normalizes a 3 or 6 character hex color code into standard 6-character hex.
 *
 * @param {string} value
 * @param {string} defaultVal
 * @returns {string}
 */
function normalizeHexColor(value, defaultVal) {
  if (!isValidHexColor(value)) return defaultVal;
  const trimmed = value.trim();
  if (trimmed.length === 4) {
    return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`;
  }
  return trimmed;
}


/**
 * Default widget ordering array.
 */
const DEFAULT_WIDGET_ORDER = ['weather', 'quote', 'todo', 'news'];

/**
 * Normalizes widget order array.
 *
 * @param {*} val
 * @param {boolean} [fallbackToDefault=true]
 * @returns {string[]|undefined}
 */
function sanitizeWidgetOrderList(val, fallbackToDefault = true) {
  if (!Array.isArray(val)) return fallbackToDefault ? [...DEFAULT_WIDGET_ORDER] : undefined;
  const normalized = [];
  val.forEach((id) => {
    if (typeof id === 'string' && DEFAULT_WIDGET_ORDER.includes(id) && !normalized.includes(id)) {
      normalized.push(id);
    }
  });
  DEFAULT_WIDGET_ORDER.forEach((id) => {
    if (!normalized.includes(id)) normalized.push(id);
  });
  return normalized;
}

/**
 * Authoritative schema registry defining validation and sanitization
 * for all canonical Homebase storage keys.
 */
const SCHEMA_DEFINITIONS = {
  // --- Wallpapers & Background Media ---
  wallpaperSelection: {
    default: null,
    validate: (val) => val === null || isPlainObject(val),
    sanitize: (val, fallback = true) => {
      if (val === null) return null;
      if (!isPlainObject(val)) return fallback ? null : undefined;
      const clean = {};
      if (typeof val.id === 'string') clean.id = val.id.slice(0, 128);
      if (typeof val.title === 'string') clean.title = val.title.slice(0, 120);
      clean.type = val.type === 'video' ? 'video' : 'static';
      if (typeof val.videoUrl === 'string') clean.videoUrl = val.videoUrl.slice(0, 4096);
      if (typeof val.posterUrl === 'string') clean.posterUrl = val.posterUrl.slice(0, 4096);
      if (typeof val.mode === 'string') clean.mode = val.mode === 'fit' ? 'fit' : 'fill';
      if (typeof val.author === 'string') clean.author = val.author.slice(0, 120);
      if (typeof val.source === 'string') clean.source = val.source === 'user' ? 'user' : 'curated';
      return clean;
    }
  },
  cachedAppliedPosterUrl: {
    default: '',
    validate: (val) => typeof val === 'string' && val.length <= 4096,
    sanitize: (val, fallback = true) => (typeof val === 'string' ? val.slice(0, 4096) : (fallback ? '' : undefined))
  },
  cachedAppliedPosterDataUrl: {
    default: '',
    validate: (val) => typeof val === 'string' && val.length <= 250000 && (val === '' || val.startsWith('data:image/')),
    sanitize: (val, fallback = true) => {
      if (typeof val === 'string' && (val === '' || val.startsWith('data:image/'))) {
        return val.length <= 250000 ? val : (fallback ? '' : undefined);
      }
      return fallback ? '' : undefined;
    }
  },
  cachedAppliedPoster: {
    default: '',
    validate: (val) => typeof val === 'string',
    sanitize: (val, fallback = true) => (typeof val === 'string' ? val.slice(0, 4096) : (fallback ? '' : undefined))
  },
  cachedAppliedVideoUrl: {
    default: '',
    validate: (val) => typeof val === 'string' && val.length <= 4096,
    sanitize: (val, fallback = true) => (typeof val === 'string' ? val.slice(0, 4096) : (fallback ? '' : undefined))
  },
  videosManifest: {
    default: [],
    validate: (val) => Array.isArray(val),
    sanitize: (val, fallback = true) => (Array.isArray(val) ? val.filter(isPlainObject) : (fallback ? [] : undefined))
  },
  videosManifestFetchedAt: {
    default: 0,
    validate: (val) => Number.isFinite(val) && val >= 0,
    sanitize: (val, fallback = true) => (Number.isFinite(Number(val)) && Number(val) >= 0 ? Number(val) : (fallback ? 0 : undefined))
  },
  cachedGalleryPosters: {
    default: [],
    validate: (val) => Array.isArray(val) && val.every((item) => typeof item === 'string'),
    sanitize: (val, fallback = true) => (Array.isArray(val) ? val.filter((item) => typeof item === 'string') : (fallback ? [] : undefined))
  },
  wallpaperPoolIds: {
    default: [],
    validate: (val) => Array.isArray(val) && val.every((item) => typeof item === 'string'),
    sanitize: (val, fallback = true) => (Array.isArray(val) ? val.filter((item) => typeof item === 'string').slice(0, 500) : (fallback ? [] : undefined))
  },
  wallpaperFallbackUsedAt: {
    default: 0,
    validate: (val) => Number.isFinite(val) && val >= 0,
    sanitize: (val, fallback = true) => (Number.isFinite(Number(val)) && Number(val) >= 0 ? Number(val) : (fallback ? 0 : undefined))
  },
  pendingDailyRotation: {
    default: null,
    validate: (val) => val === null || isPlainObject(val),
    sanitize: (val, fallback = true) => (val === null ? null : (isPlainObject(val) ? val : (fallback ? null : undefined)))
  },
  pendingDailyRotationSince: {
    default: 0,
    validate: (val) => Number.isFinite(val) && val >= 0,
    sanitize: (val, fallback = true) => (Number.isFinite(Number(val)) && Number(val) >= 0 ? Number(val) : (fallback ? 0 : undefined))
  },
  galleryFavorites: {
    default: [],
    validate: (val) => Array.isArray(val) && val.every((item) => typeof item === 'string'),
    sanitize: (val, fallback = true) => (Array.isArray(val) ? val.filter((item) => typeof item === 'string').slice(0, 500) : (fallback ? [] : undefined))
  },
  dailyWallpaperEnabled: {
    default: true,
    validate: (val) => typeof val === 'boolean',
    sanitize: (val, fallback = true) => (typeof val === 'boolean' ? val : (fallback ? true : undefined))
  },
  wallpaperTypePreference: {
    default: 'video',
    validate: (val) => val === 'video' || val === 'static',
    sanitize: (val, fallback = true) => (val === 'video' || val === 'static' ? val : (fallback ? 'video' : undefined))
  },
  wallpaperQualityPreference: {
    default: 'high',
    validate: (val) => val === 'high' || val === 'low',
    sanitize: (val, fallback = true) => (val === 'high' || val === 'low' ? val : (fallback ? 'high' : undefined))
  },
  myWallpapers: {
    default: [],
    validate: (val) => Array.isArray(val),
    sanitize: (val, fallback = true) => {
      if (!Array.isArray(val)) return fallback ? [] : undefined;
      if (typeof normalizeMyWallpapersItems === 'function') {
        return normalizeMyWallpapersItems(val);
      }
      const seen = new Set();
      return val
        .map((item) => {
          if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
          const id = typeof item.id === 'string' ? item.id.trim() : '';
          if (!id || seen.has(id)) return null;
          seen.add(id);
          return {
            id,
            title: typeof item.title === 'string' ? item.title.slice(0, 120) : 'My Wallpaper',
            type: item.type === 'video' ? 'video' : 'image',
            mimeType: typeof item.mimeType === 'string' ? item.mimeType.slice(0, 64) : '',
            cacheKey: typeof item.cacheKey === 'string' ? item.cacheKey.slice(0, 256) : '',
            posterCacheKey: typeof item.posterCacheKey === 'string' ? item.posterCacheKey.slice(0, 256) : '',
            size: Number.isFinite(item.size) && item.size >= 0 ? Math.floor(item.size) : 0,
            posterSize: Number.isFinite(item.posterSize) && item.posterSize >= 0 ? Math.floor(item.posterSize) : 0,
            createdAt: Number.isFinite(item.createdAt) ? item.createdAt : Date.now(),
            lastUsedAt: Number.isFinite(item.lastUsedAt) ? item.lastUsedAt : 0,
            originalName: typeof item.originalName === 'string' ? item.originalName.slice(0, 180) : ''
          };
        })
        .filter(Boolean)
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    }
  },

  // --- Clock & Visual Preferences ---
  appTimeFormatPreference: {
    default: '12-hour',
    validate: (val) => val === '12-hour' || val === '24-hour',
    sanitize: (val, fallback = true) => (val === '12-hour' || val === '24-hour' ? val : (fallback ? '12-hour' : undefined))
  },
  appBackgroundDim: {
    default: 0,
    validate: (val) => Number.isInteger(val) && val >= 0 && val <= 80,
    sanitize: (val, fallback = true) => {
      const num = typeof val === 'number' ? val : Number(val);
      if (!Number.isFinite(num)) return fallback ? 0 : undefined;
      return clampInteger(num, 0, 80, 0);
    }
  },
  appGlassStylePref: {
    default: 'original',
    validate: (val) => val === 'original' || val === 'frosted' || val === 'tinted',
    sanitize: (val, fallback = true) => (val === 'original' || val === 'frosted' || val === 'tinted' ? val : (fallback ? 'original' : undefined))
  },
  appGridAnimationPref: {
    default: 'default',
    validate: (val) => val === 'default' || val === 'fade' || val === 'slide' || val === 'pop',
    sanitize: (val, fallback = true) => (['default', 'fade', 'slide', 'pop'].includes(val) ? val : (fallback ? 'default' : undefined))
  },
  appGridAnimationSpeed: {
    default: 0.3,
    validate: (val) => Number.isFinite(val) && val >= 0.1 && val <= 1.0,
    sanitize: (val, fallback = true) => {
      const num = typeof val === 'number' ? val : Number(val);
      if (!Number.isFinite(num)) return fallback ? 0.3 : undefined;
      return clampNumber(num, 0.1, 1.0, 0.3);
    }
  },
  appGridAnimationEnabled: {
    default: false,
    validate: (val) => typeof val === 'boolean',
    sanitize: (val, fallback = true) => (typeof val === 'boolean' ? val : (fallback ? false : undefined))
  },

  // --- Widgets & Sidebar ---
  appShowSidebar: {
    default: true,
    validate: (val) => typeof val === 'boolean',
    sanitize: (val, fallback = true) => (typeof val === 'boolean' ? val : (fallback ? true : undefined))
  },
  appShowWeather: {
    default: true,
    validate: (val) => typeof val === 'boolean',
    sanitize: (val, fallback = true) => (typeof val === 'boolean' ? val : (fallback ? true : undefined))
  },
  appShowQuote: {
    default: true,
    validate: (val) => typeof val === 'boolean',
    sanitize: (val, fallback = true) => (typeof val === 'boolean' ? val : (fallback ? true : undefined))
  },
  appShowNews: {
    default: false,
    validate: (val) => typeof val === 'boolean',
    sanitize: (val, fallback = true) => (typeof val === 'boolean' ? val : (fallback ? false : undefined))
  },
  appShowTodo: {
    default: true,
    validate: (val) => typeof val === 'boolean',
    sanitize: (val, fallback = true) => (typeof val === 'boolean' ? val : (fallback ? true : undefined))
  },
  widgetOrder: {
    default: DEFAULT_WIDGET_ORDER,
    validate: (val) => Array.isArray(val) && val.length === 4 && DEFAULT_WIDGET_ORDER.every((id) => val.includes(id)),
    sanitize: (val, fallback = true) => sanitizeWidgetOrderList(val, fallback)
  },
  appNewsSource: {
    default: 'aljazeera',
    validate: (val) => ['aljazeera', 'bbc-top', 'bbc', 'techcrunch', 'espn', 'espn-cricinfo'].includes(val),
    sanitize: (val, fallback = true) => (['aljazeera', 'bbc-top', 'bbc', 'techcrunch', 'espn', 'espn-cricinfo'].includes(val) ? val : (fallback ? 'aljazeera' : undefined))
  },

  // --- Todos ---
  todoItems: {
    default: [],
    validate: (val) => Array.isArray(val) && val.every((item) => item && typeof item === 'object' && typeof item.id === 'string' && typeof item.text === 'string' && typeof item.done === 'boolean'),
    sanitize: (val, fallback = true) => {
      if (!Array.isArray(val)) return fallback ? [] : undefined;
      if (typeof normalizeTodoItems === 'function') {
        return normalizeTodoItems(val);
      }
      const seenIds = new Set();
      return val
        .map((item, idx) => {
          if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
          let id = typeof item.id === 'string' && item.id.trim() ? item.id.trim() : '';
          if (!id || seenIds.has(id)) {
            id = `todo-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`;
          }
          seenIds.add(id);
          const text = typeof item.text === 'string' ? item.text.trim().slice(0, 500) : '';
          const done = Boolean(item.done);
          const createdAt = Number.isFinite(item.createdAt) ? item.createdAt : Date.now();
          return { id, text, done, createdAt };
        })
        .filter(Boolean);
    }
  },
  todoHideDone: {
    default: false,
    validate: (val) => typeof val === 'boolean',
    sanitize: (val, fallback = true) => (typeof val === 'boolean' ? val : (fallback ? false : undefined))
  },

  // --- Quotes ---
  quoteUpdateFrequency: {
    default: 'hourly',
    validate: (val) => ['per-tab', 'hourly', 'daily'].includes(val),
    sanitize: (val, fallback = true) => (['per-tab', 'hourly', 'daily'].includes(val) ? val : (fallback ? 'hourly' : undefined))
  },
  quoteLocalIndexV1: {
    default: 0,
    validate: (val) => Number.isInteger(val) && val >= 0,
    sanitize: (val, fallback = true) => {
      const num = typeof val === 'number' ? val : Number(val);
      return Number.isFinite(num) && num >= 0 ? Math.floor(num) : (fallback ? 0 : undefined);
    }
  },
  quoteTags: {
    default: [],
    validate: (val) => Array.isArray(val) && val.every((t) => typeof t === 'string'),
    sanitize: (val, fallback = true) => (Array.isArray(val) ? val.filter((t) => typeof t === 'string' && t.trim()).map((t) => t.trim().slice(0, 50)) : (fallback ? [] : undefined))
  },

  // --- Weather ---
  cachedWeatherData: {
    default: null,
    validate: (val) => val === null || isPlainObject(val),
    sanitize: (val, fallback = true) => (val === null ? null : (isPlainObject(val) ? val : (fallback ? null : undefined)))
  },
  cachedCityName: {
    default: '',
    validate: (val) => typeof val === 'string' && val.length <= 120,
    sanitize: (val, fallback = true) => (typeof val === 'string' ? val.slice(0, 120) : (fallback ? '' : undefined))
  },
  cachedUnits: {
    default: 'celsius',
    validate: (val) => val === 'celsius' || val === 'fahrenheit',
    sanitize: (val, fallback = true) => (val === 'celsius' || val === 'fahrenheit' ? val : (fallback ? 'celsius' : undefined))
  },
  weatherFetchedAt: {
    default: 0,
    validate: (val) => Number.isFinite(val) && val >= 0,
    sanitize: (val, fallback = true) => (Number.isFinite(Number(val)) && Number(val) >= 0 ? Number(val) : (fallback ? 0 : undefined))
  },
  weatherLat: {
    default: null,
    validate: (val) => val === null || (Number.isFinite(val) && val >= -90 && val <= 90),
    sanitize: (val, fallback = true) => {
      if (val === null) return null;
      const num = typeof val === 'number' ? val : Number(val);
      if (!Number.isFinite(num)) return fallback ? null : undefined;
      return clampNumber(num, -90, 90, null);
    }
  },
  weatherLon: {
    default: null,
    validate: (val) => val === null || (Number.isFinite(val) && val >= -180 && val <= 180),
    sanitize: (val, fallback = true) => {
      if (val === null) return null;
      const num = typeof val === 'number' ? val : Number(val);
      if (!Number.isFinite(num)) return fallback ? null : undefined;
      return clampNumber(num, -180, 180, null);
    }
  },
  weatherCityName: {
    default: '',
    validate: (val) => typeof val === 'string' && val.length <= 120,
    sanitize: (val, fallback = true) => (typeof val === 'string' ? val.slice(0, 120) : (fallback ? '' : undefined))
  },
  weatherUnits: {
    default: 'celsius',
    validate: (val) => val === 'celsius' || val === 'fahrenheit',
    sanitize: (val, fallback = true) => (val === 'celsius' || val === 'fahrenheit' ? val : (fallback ? 'celsius' : undefined))
  },

  // --- Search Engine Preferences ---
  appSearchOpenNewTab: {
    default: false,
    validate: (val) => typeof val === 'boolean',
    sanitize: (val, fallback = true) => (typeof val === 'boolean' ? val : (fallback ? false : undefined))
  },
  appSearchRememberEngine: {
    default: true,
    validate: (val) => typeof val === 'boolean',
    sanitize: (val, fallback = true) => (typeof val === 'boolean' ? val : (fallback ? true : undefined))
  },
  appSearchDefaultEngine: {
    default: 'google',
    validate: (val) => typeof val === 'string' && val.trim().length > 0 && val.length <= 64,
    sanitize: (val, fallback = true) => (typeof val === 'string' && val.trim() ? val.trim().slice(0, 64) : (fallback ? 'google' : undefined))
  },
  appSearchMath: {
    default: true,
    validate: (val) => typeof val === 'boolean',
    sanitize: (val, fallback = true) => (typeof val === 'boolean' ? val : (fallback ? true : undefined))
  },
  appSearchShowHistory: {
    default: false,
    validate: (val) => typeof val === 'boolean',
    sanitize: (val, fallback = true) => (typeof val === 'boolean' ? val : (fallback ? false : undefined))
  },
  appSearchSuggestionsEnabled: {
    default: true,
    validate: (val) => typeof val === 'boolean',
    sanitize: (val, fallback = true) => (typeof val === 'boolean' ? val : (fallback ? true : undefined))
  },
  currentSearchEngineId: {
    default: 'google',
    validate: (val) => typeof val === 'string' && val.trim().length > 0 && val.length <= 64,
    sanitize: (val, fallback = true) => (typeof val === 'string' && val.trim() ? val.trim().slice(0, 64) : (fallback ? 'google' : undefined))
  },
  searchEnginesConfig: {
    default: [],
    validate: (val) => Array.isArray(val) && val.every((e) => isPlainObject(e) && typeof e.id === 'string' && typeof e.enabled === 'boolean'),
    sanitize: (val, fallback = true) => {
      if (!Array.isArray(val)) return fallback ? [] : undefined;
      return val
        .map((entry) => {
          if (!isPlainObject(entry)) return null;
          const id = typeof entry.id === 'string' ? entry.id.trim() : '';
          if (!id) return null;
          return { id, enabled: Boolean(entry.enabled) };
        })
        .filter(Boolean);
    }
  },

  // --- Bookmarks Styling & Management ---
  appBookmarkOpenNewTab: {
    default: false,
    validate: (val) => typeof val === 'boolean',
    sanitize: (val, fallback = true) => (typeof val === 'boolean' ? val : (fallback ? false : undefined))
  },
  appBookmarkTextBg: {
    default: true,
    validate: (val) => typeof val === 'boolean',
    sanitize: (val, fallback = true) => (typeof val === 'boolean' ? val : (fallback ? true : undefined))
  },
  appBookmarkTextBgColor: {
    default: '#2CA5FF',
    validate: (val) => isValidHexColor(val),
    sanitize: (val, fallback = true) => (isValidHexColor(val) ? normalizeHexColor(val, '#2CA5FF') : (fallback ? '#2CA5FF' : undefined))
  },
  appBookmarkTextBgOpacity: {
    default: 0.65,
    validate: (val) => Number.isFinite(val) && val >= 0.1 && val <= 1.0,
    sanitize: (val, fallback = true) => {
      const num = typeof val === 'number' ? val : Number(val);
      if (!Number.isFinite(num)) return fallback ? 0.65 : undefined;
      return clampNumber(num, 0.1, 1.0, 0.65);
    }
  },
  appBookmarkTextBgBlur: {
    default: 4,
    validate: (val) => Number.isFinite(val) && val >= 0 && val <= 20,
    sanitize: (val, fallback = true) => {
      const num = typeof val === 'number' ? val : Number(val);
      if (!Number.isFinite(num)) return fallback ? 4 : undefined;
      return clampInteger(num, 0, 20, 4);
    }
  },
  appBookmarkFallbackColor: {
    default: '#00b8d4',
    validate: (val) => isValidHexColor(val),
    sanitize: (val, fallback = true) => (isValidHexColor(val) ? normalizeHexColor(val, '#00b8d4') : (fallback ? '#00b8d4' : undefined))
  },
  appBookmarkFolderColor: {
    default: '#FFFFFF',
    validate: (val) => isValidHexColor(val),
    sanitize: (val, fallback = true) => (isValidHexColor(val) ? normalizeHexColor(val, '#FFFFFF') : (fallback ? '#FFFFFF' : undefined))
  },
  bookmarkCustomMetadata: {
    default: {},
    validate: (val) => isPlainObject(val),
    sanitize: (val, fallback = true) => {
      if (!isPlainObject(val)) return fallback ? {} : undefined;
      const clean = {};
      for (const [id, meta] of Object.entries(val)) {
        if (typeof id !== 'string' || !id || !isPlainObject(meta)) continue;
        const cleanMeta = {};
        if (typeof meta.icon === 'string') cleanMeta.icon = meta.icon.slice(0, 100000);
        if (typeof meta.customTitle === 'string') cleanMeta.customTitle = meta.customTitle.slice(0, 300);
        if (typeof meta.originalUrl === 'string') cleanMeta.originalUrl = meta.originalUrl.slice(0, 4096);
        if (typeof meta.containerId === 'string') cleanMeta.containerId = meta.containerId.slice(0, 64);
        clean[id] = cleanMeta;
      }
      return clean;
    }
  },
  homebaseBookmarkRootId: {
    default: '',
    validate: (val) => typeof val === 'string',
    sanitize: (val, fallback = true) => (typeof val === 'string' ? val.slice(0, 128) : (fallback ? '' : undefined))
  },
  folderCustomMetadata: {
    default: {},
    validate: (val) => isPlainObject(val),
    sanitize: (val, fallback = true) => {
      if (!isPlainObject(val)) return fallback ? {} : undefined;
      const clean = {};
      for (const [id, meta] of Object.entries(val)) {
        if (typeof id !== 'string' || !id || !isPlainObject(meta)) continue;
        const cleanMeta = {};
        if (typeof meta.color === 'string' && isValidHexColor(meta.color)) cleanMeta.color = normalizeHexColor(meta.color, '#FFFFFF');
        if (typeof meta.icon === 'string') cleanMeta.icon = meta.icon.slice(0, 128);
        if (Array.isArray(meta.customOrder)) {
          cleanMeta.customOrder = meta.customOrder.filter((item) => typeof item === 'string').slice(0, 1000);
        }
        clean[id] = cleanMeta;
      }
      return clean;
    }
  },
  domainIconMap: {
    default: {},
    validate: (val) => isPlainObject(val),
    sanitize: (val, fallback = true) => {
      if (!isPlainObject(val)) return fallback ? {} : undefined;
      const clean = {};
      for (const [domain, iconUrl] of Object.entries(val)) {
        if (typeof domain !== 'string' || !domain || typeof iconUrl !== 'string') continue;
        if (iconUrl.startsWith('data:image/') || iconUrl === '') {
          clean[domain] = iconUrl.slice(0, 100000);
        }
      }
      return clean;
    }
  },
  lastUsedBookmarkFolderId: {
    default: '',
    validate: (val) => typeof val === 'string',
    sanitize: (val, fallback = true) => (typeof val === 'string' ? val.slice(0, 128) : (fallback ? '' : undefined))
  },
  homebaseRecentSaveFolders: {
    default: [],
    validate: (val) => Array.isArray(val) && val.length <= 6 && val.every((id) => typeof id === 'string'),
    sanitize: (val, fallback = true) => {
      if (!Array.isArray(val)) return fallback ? [] : undefined;
      return val
        .map((id) => (typeof id === 'string' ? id.trim() : ''))
        .filter(Boolean)
        .slice(0, 6);
    }
  },

  // --- Tabs, Advanced & Performance ---
  appMaxTabsCount: {
    default: 0,
    validate: (val) => Number.isInteger(val) && val >= 0 && val <= 100,
    sanitize: (val, fallback = true) => {
      const num = typeof val === 'number' ? val : Number(val);
      if (!Number.isFinite(num)) return fallback ? 0 : undefined;
      return clampInteger(num, 0, 100, 0);
    }
  },
  appAutoCloseMinutes: {
    default: 0,
    validate: (val) => Number.isInteger(val) && val >= 0 && val <= 1440,
    sanitize: (val, fallback = true) => {
      const num = typeof val === 'number' ? val : Number(val);
      if (!Number.isFinite(num)) return fallback ? 0 : undefined;
      return clampInteger(num, 0, 1440, 0);
    }
  },
  appSingletonMode: {
    default: false,
    validate: (val) => typeof val === 'boolean',
    sanitize: (val, fallback = true) => (typeof val === 'boolean' ? val : (fallback ? false : undefined))
  },
  appPerformanceMode: {
    default: false,
    validate: (val) => typeof val === 'boolean',
    sanitize: (val, fallback = true) => (typeof val === 'boolean' ? val : (fallback ? false : undefined))
  },
  debugPerfOverlay: {
    default: false,
    validate: (val) => typeof val === 'boolean',
    sanitize: (val, fallback = true) => (typeof val === 'boolean' ? val : (fallback ? false : undefined))
  },
  appBatteryOptimization: {
    default: false,
    validate: (val) => typeof val === 'boolean',
    sanitize: (val, fallback = true) => (typeof val === 'boolean' ? val : (fallback ? false : undefined))
  },
  appCinemaMode: {
    default: false,
    validate: (val) => typeof val === 'boolean',
    sanitize: (val, fallback = true) => (typeof val === 'boolean' ? val : (fallback ? false : undefined))
  },
  appContainerMode: {
    default: true,
    validate: (val) => typeof val === 'boolean',
    sanitize: (val, fallback = true) => (typeof val === 'boolean' ? val : (fallback ? true : undefined))
  },
  appContainerNewTab: {
    default: true,
    validate: (val) => typeof val === 'boolean',
    sanitize: (val, fallback = true) => (typeof val === 'boolean' ? val : (fallback ? true : undefined))
  },

  // --- Schema Version Baseline ---
  schemaVersion: {
    default: 1,
    validate: (val) => Number.isInteger(val) && val >= 1,
    sanitize: (val, fallback = true) => {
      const num = typeof val === 'number' ? val : Number(val);
      return Number.isInteger(num) && num >= 1 ? num : (fallback ? 1 : undefined);
    }
  }
};

/**
 * Validates whether a value conforms to the schema definition for the specified storage key.
 * Pure synchronous function; never makes network calls or storage reads.
 *
 * @param {string} key - Canonical storage key
 * @param {*} value - Candidate value
 * @returns {boolean} True if value satisfies schema
 */
function validateKey(key, value) {
  if (typeof key !== 'string') return false;
  const def = SCHEMA_DEFINITIONS[key];
  if (!def) {
    // Non-destructive: unknown future keys pass validation unless null/undefined
    return value !== undefined;
  }
  return def.validate(value);
}

/**
 * Determines the category of validation anomaly when a value is changed during sanitization.
 * Allowed categories: 'clamped', 'defaulted', 'normalized', 'rejected'.
 * Strictly metadata categorization; never inspects or outputs sensitive user payloads.
 *
 * @param {string} key
 * @param {*} originalVal
 * @param {*} sanitizedVal
 * @param {Object} def
 * @returns {'clamped'|'defaulted'|'normalized'|'rejected'}
 */
function classifyAnomalyCategory(key, originalVal, sanitizedVal, def) {
  if (sanitizedVal === undefined && originalVal !== undefined) {
    return 'rejected';
  }

  const defDefault = def?.default;
  const isDefaultVal = (sanitizedVal === defDefault) ||
    (isPlainObject(sanitizedVal) && isPlainObject(defDefault) && JSON.stringify(sanitizedVal) === JSON.stringify(defDefault)) ||
    (Array.isArray(sanitizedVal) && Array.isArray(defDefault) && JSON.stringify(sanitizedVal) === JSON.stringify(defDefault));

  // Numeric clamping check
  if ((typeof originalVal === 'number' && Number.isFinite(originalVal)) ||
      (typeof originalVal === 'string' && originalVal.trim() !== '' && Number.isFinite(Number(originalVal)))) {
    if (typeof sanitizedVal === 'number' && Number.isFinite(sanitizedVal)) {
      if (typeof def?.validate === 'function' && !def.validate(originalVal)) {
        return 'clamped';
      }
    }
  }

  // Value was replaced with default
  if (isDefaultVal && (originalVal === null || originalVal === undefined || (typeof def?.validate === 'function' && !def.validate(originalVal)))) {
    return 'defaulted';
  }

  // Otherwise, it was structural or formatting normalization
  return 'normalized';
}

/**
 * Safe notification helper that reports validation anomalies to HomebaseDiagnostics.
 * Never throws if diagnostics is unavailable.
 * Never logs actual user content or payloads.
 *
 * @param {string} key
 * @param {string} action
 * @param {string} category
 */
function notifyValidationAnomaly(key, action, category) {
  try {
    const diag = (typeof window !== 'undefined' && window.HomebaseDiagnostics) || null;
    if (diag && typeof diag.recordValidationAnomaly === 'function') {
      diag.recordValidationAnomaly({
        key,
        action,
        category
      });
    }
  } catch (_) {
    // Fail-safe: continue normally without throwing
  }
}

/**
 * Sanitizes a value for a specific storage key against its schema definition.
 * Pure synchronous function.
 *
 * @param {string} key - Canonical storage key
 * @param {*} value - Candidate value
 * @param {Object} [options]
 * @param {boolean} [options.fallbackToDefault=true] - Whether to fall back to safe default if unrecoverable
 * @returns {*} Sanitized value or undefined (if unrecoverable and fallbackToDefault is false)
 */
function sanitizeKey(key, value, options = {}) {
  if (typeof key !== 'string') return undefined;
  const fallback = options.fallbackToDefault !== false;
  const def = SCHEMA_DEFINITIONS[key];
  if (!def) {
    // Non-destructive: unknown future keys preserved as-is
    return value !== undefined ? value : (fallback ? null : undefined);
  }
  const sanitized = def.sanitize(value, fallback);

  // Check if value was modified during sanitization
  let changed = false;
  if (value !== sanitized) {
    if (value && sanitized && typeof value === 'object' && typeof sanitized === 'object') {
      try {
        changed = JSON.stringify(value) !== JSON.stringify(sanitized);
      } catch (_) {
        changed = true;
      }
    } else {
      changed = true;
    }
  }

  if (changed) {
    try {
      const category = classifyAnomalyCategory(key, value, sanitized, def);
      const action = category;
      notifyValidationAnomaly(key, action, category);
    } catch (_) {
      // Continue normally without throwing
    }
  }

  return sanitized;
}

/**
 * Sanitizes an entire storage dictionary batch in memory.
 * Pure synchronous function; sub-millisecond execution.
 *
 * @param {Object} batch - Key-value dictionary to sanitize
 * @param {Object} [options]
 * @param {boolean} [options.fallbackToDefault=false] - Whether to assign defaults for invalid keys
 * @returns {Object} Sanitized dictionary
 */
function sanitizeStorageBatch(batch, options = {}) {
  if (!isPlainObject(batch)) return {};
  const fallback = options.fallbackToDefault === true;
  const sanitized = {};

  for (const [key, value] of Object.entries(batch)) {
    // Prototype pollution guard
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      continue;
    }

    if (Object.prototype.hasOwnProperty.call(SCHEMA_DEFINITIONS, key)) {
      const sanitizedVal = sanitizeKey(key, value, { fallbackToDefault: fallback });
      if (sanitizedVal !== undefined) {
        sanitized[key] = sanitizedVal;
      }
    } else {
      // Non-destructive: preserve unknown future keys if valid JSON primitives/objects
      if (value !== undefined) {
        sanitized[key] = value;
      }
    }
  }

  return sanitized;
}

// Global and window namespace registration
if (typeof window !== 'undefined') {
  window.validateKey = validateKey;
  window.sanitizeKey = sanitizeKey;
  window.sanitizeStorageBatch = sanitizeStorageBatch;
  window.HomebaseValidator = {
    validateKey,
    sanitizeKey,
    sanitizeStorageBatch,
    classifyAnomalyCategory,
    isPlainObject: (typeof isPlainObject === 'function' ? isPlainObject : window.isPlainObject),
    isValidHexColor,
    clampNumber: (typeof clampNumber === 'function' ? clampNumber : window.clampNumber),
    clampInteger: (typeof clampInteger === 'function' ? clampInteger : window.clampInteger),
    SCHEMA_DEFINITIONS
  };
}
