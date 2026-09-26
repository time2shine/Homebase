const HOMEBASE_BACKUP_SCHEMA = 'homebase.export';
const HOMEBASE_BACKUP_VERSION = 1;

const HOMEBASE_OWNED_STORAGE_KEYS = [
  'wallpaperSelection',
  'cachedAppliedPosterUrl',
  'cachedAppliedPosterDataUrl',
  'cachedAppliedPoster',
  'cachedAppliedVideoUrl',
  'videosManifest',
  'videosManifestFetchedAt',
  'cachedGalleryPosters',
  'wallpaperPoolIds',
  'wallpaperFallbackUsedAt',
  'pendingDailyRotation',
  'pendingDailyRotationSince',
  'galleryFavorites',
  'dailyWallpaperEnabled',
  'wallpaperTypePreference',
  'wallpaperQualityPreference',
  'appTimeFormatPreference',
  'appBackgroundDim',
  'appShowSidebar',
  'appShowWeather',
  'appShowQuote',
  'appShowNews',
  'appShowTodo',
  'todoItems',
  'todoHideDone',
  'widgetOrder',
  'appNewsSource',
  'appMaxTabsCount',
  'appAutoCloseMinutes',
  'appSingletonMode',
  'appSearchOpenNewTab',
  'appSearchRememberEngine',
  'appSearchDefaultEngine',
  'appSearchMath',
  'appSearchShowHistory',
  'appSearchSuggestionsEnabled',
  'appBookmarkOpenNewTab',
  'appBookmarkTextBg',
  'appBookmarkTextBgColor',
  'appBookmarkTextBgOpacity',
  'appBookmarkTextBgBlur',
  'appBookmarkFallbackColor',
  'appBookmarkFolderColor',
  'appPerformanceMode',
  'debugPerfOverlay',
  'appBatteryOptimization',
  'appCinemaMode',
  'appContainerMode',
  'appContainerNewTab',
  'appGridAnimationPref',
  'appGridAnimationSpeed',
  'appGridAnimationEnabled',
  'appGlassStylePref',
  'bookmarkCustomMetadata',
  'homebaseBookmarkRootId',
  'folderCustomMetadata',
  'domainIconMap',
  'lastUsedBookmarkFolderId',
  'homebaseRecentSaveFolders',
  'quoteUpdateFrequency',
  'quoteLocalIndexV1',
  'quoteTags',
  'searchEnginesConfig',
  'currentSearchEngineId',
  'cachedWeatherData',
  'cachedCityName',
  'cachedUnits',
  'weatherFetchedAt',
  'weatherLat',
  'weatherLon',
  'weatherCityName',
  'weatherUnits',
  'myWallpapers',
  'schemaVersion'
];

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function normalizeMyWallpapersItems(items) {
  if (!Array.isArray(items)) return [];
  const seen = new Set();

  return items
    .map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
      const id = typeof item.id === 'string' ? item.id.trim() : '';
      if (!id || seen.has(id)) return null;
      seen.add(id);

      const title = typeof item.title === 'string' ? item.title.slice(0, 120) : 'My Wallpaper';
      const type = item.type === 'video' ? 'video' : 'image';
      const mimeType = typeof item.mimeType === 'string' ? item.mimeType.slice(0, 64) : '';
      const cacheKey = typeof item.cacheKey === 'string' ? item.cacheKey.slice(0, 256) : '';
      const posterCacheKey = typeof item.posterCacheKey === 'string' ? item.posterCacheKey.slice(0, 256) : '';
      const size = Number.isFinite(item.size) && item.size >= 0 ? Math.floor(item.size) : 0;
      const posterSize = Number.isFinite(item.posterSize) && item.posterSize >= 0 ? Math.floor(item.posterSize) : 0;
      const createdAt = Number.isFinite(item.createdAt) ? item.createdAt : Date.now();
      const lastUsedAt = Number.isFinite(item.lastUsedAt) ? item.lastUsedAt : 0;
      const originalName = typeof item.originalName === 'string' ? item.originalName.slice(0, 180) : '';

      return {
        id,
        title,
        type,
        mimeType,
        cacheKey,
        posterCacheKey,
        size,
        posterSize,
        createdAt,
        lastUsedAt,
        originalName
      };
    })
    .filter(Boolean)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

async function exportHomebaseState() {
  if (!browser?.storage?.local) {
    throw new Error('Storage is unavailable.');
  }

  const stored = await browser.storage.local.get(HOMEBASE_OWNED_STORAGE_KEYS);
  const storageLocal = {};

  HOMEBASE_OWNED_STORAGE_KEYS.forEach((key) => {
    if (stored && stored[key] !== undefined) {
      storageLocal[key] = stored[key];
    }
  });

  const payload = {
    schema: HOMEBASE_BACKUP_SCHEMA,
    version: HOMEBASE_BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    storageLocal
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const dateTag = new Date().toISOString().slice(0, 10);

  link.href = url;
  link.download = `homebase-backup-${dateTag}.json`;
  link.style.display = 'none';

  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function importHomebaseState(file) {
  if (!browser?.storage?.local) {
    throw new Error('Storage is unavailable.');
  }
  if (!file) {
    throw new Error('No backup file selected.');
  }

  let parsed;
  try {
    const text = await file.text();
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error('Invalid JSON file.');
  }

  if (!parsed || parsed.schema !== HOMEBASE_BACKUP_SCHEMA) {
    throw new Error('Invalid backup schema.');
  }
  if (typeof parsed.version !== 'number' || parsed.version !== HOMEBASE_BACKUP_VERSION) {
    throw new Error('Unsupported backup version.');
  }
  if (!isPlainObject(parsed.storageLocal)) {
    throw new Error('Invalid backup payload.');
  }

  const incoming = parsed.storageLocal;
  const updates = {};

  // Backward-compatible fallback: migrate legacy popup folder key if canonical key is missing
  if (
    Object.prototype.hasOwnProperty.call(incoming, 'homebaseLastUsedFolderId') &&
    !Object.prototype.hasOwnProperty.call(incoming, 'lastUsedBookmarkFolderId')
  ) {
    if (typeof incoming['homebaseLastUsedFolderId'] === 'string') {
      incoming['lastUsedBookmarkFolderId'] = incoming['homebaseLastUsedFolderId'];
    }
  }

  HOMEBASE_OWNED_STORAGE_KEYS.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(incoming, key)) {
      if (key === 'todoItems') {
        if (Array.isArray(incoming[key])) {
          updates[key] = typeof normalizeTodoItems === 'function'
            ? normalizeTodoItems(incoming[key])
            : incoming[key];
        }
        return;
      }
      if (key === 'todoHideDone') {
        if (typeof incoming[key] === 'boolean') {
          updates[key] = incoming[key];
        }
        return;
      }
      if (key === 'myWallpapers') {
        if (Array.isArray(incoming[key])) {
          updates[key] = normalizeMyWallpapersItems(incoming[key]);
        }
        return;
      }
      if (key === 'homebaseRecentSaveFolders') {
        if (Array.isArray(incoming[key])) {
          updates[key] = incoming[key]
            .map((id) => (typeof id === 'string' ? id.trim() : ''))
            .filter(Boolean)
            .slice(0, 6);
        }
        return;
      }
      if (key === 'schemaVersion') {
        if (typeof incoming[key] === 'number' && Number.isInteger(incoming[key]) && incoming[key] > 0) {
          updates[key] = incoming[key];
        }
        return;
      }
      updates[key] = incoming[key];
    }
  });

  if (Object.keys(updates).length) {
    await browser.storage.local.set(updates);
  }

  try {
    if (window.localStorage) {
      if (Object.prototype.hasOwnProperty.call(incoming, 'appBackgroundDim')) {
        const dimValue = incoming['appBackgroundDim'];
        if (Number.isFinite(dimValue)) {
          localStorage.setItem('fast-bg-dim', String(dimValue));
        }
      }

      if (Object.prototype.hasOwnProperty.call(incoming, 'appShowSidebar')) {
        const sidebarValue = incoming['appShowSidebar'];
        if (typeof sidebarValue === 'boolean') {
          localStorage.setItem('fast-show-sidebar', sidebarValue ? '1' : '0');
        }
      }

      if (Object.prototype.hasOwnProperty.call(incoming, 'appShowWeather')) {
        const weatherValue = incoming['appShowWeather'];
        if (typeof weatherValue === 'boolean') {
          localStorage.setItem('fast-show-weather', weatherValue ? '1' : '0');
        }
      }

      if (Object.prototype.hasOwnProperty.call(incoming, 'appShowQuote')) {
        const quoteValue = incoming['appShowQuote'];
        if (typeof quoteValue === 'boolean') {
          localStorage.setItem('fast-show-quote', quoteValue ? '1' : '0');
        }
      }

      if (Object.prototype.hasOwnProperty.call(incoming, 'appShowNews')) {
        const newsValue = incoming['appShowNews'];
        if (typeof newsValue === 'boolean') {
          localStorage.setItem('fast-show-news', newsValue ? '1' : '0');
        }
      }

      if (Object.prototype.hasOwnProperty.call(incoming, 'appShowTodo')) {
        const todoValue = incoming['appShowTodo'];
        if (typeof todoValue === 'boolean') {
          localStorage.setItem('fast-show-todo', todoValue ? '1' : '0');
        }
      }
    }
  } catch (err) {
    // Ignore; mirrors are best-effort only
  }

  if (typeof showCustomDialog === 'function') {
    showCustomDialog('Import complete', 'Homebase settings have been restored. Reloading...');
  }
  if (typeof window.location?.reload === 'function') {
    window.location.reload();
  }
}

window.HomebaseBackup = {
  exportState: exportHomebaseState,
  importState: importHomebaseState
};
