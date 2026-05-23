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
  'weatherUnits'
];

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
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
  const removals = [];

  HOMEBASE_OWNED_STORAGE_KEYS.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(incoming, key)) {
      if (key === 'todoItems') {
        if (Array.isArray(incoming[key])) {
          updates[key] = normalizeTodoItems(incoming[key]);
        }
        return;
      }
      if (key === 'todoHideDone') {
        if (typeof incoming[key] === 'boolean') {
          updates[key] = incoming[key];
        }
        return;
      }
      updates[key] = incoming[key];
      return;
    }
    if (key === 'todoItems' || key === 'todoHideDone') {
      return;
    }
    removals.push(key);
  });

  if (Object.keys(updates).length) {
    await browser.storage.local.set(updates);
  }
  if (removals.length) {
    await browser.storage.local.remove(removals);
  }

  try {
    if (window.localStorage) {
      const dimValue = incoming['appBackgroundDim'];
      if (Object.prototype.hasOwnProperty.call(incoming, 'appBackgroundDim') && Number.isFinite(dimValue)) {
        localStorage.setItem('fast-bg-dim', String(dimValue));
      } else {
        localStorage.removeItem('fast-bg-dim');
      }

      const sidebarValue = incoming['appShowSidebar'];
      if (Object.prototype.hasOwnProperty.call(incoming, 'appShowSidebar') && typeof sidebarValue === 'boolean') {
        localStorage.setItem('fast-show-sidebar', sidebarValue ? '1' : '0');
      } else {
        localStorage.removeItem('fast-show-sidebar');
      }

      const weatherValue = incoming['appShowWeather'];
      if (Object.prototype.hasOwnProperty.call(incoming, 'appShowWeather') && typeof weatherValue === 'boolean') {
        localStorage.setItem('fast-show-weather', weatherValue ? '1' : '0');
      } else {
        localStorage.removeItem('fast-show-weather');
      }

      const quoteValue = incoming['appShowQuote'];
      if (Object.prototype.hasOwnProperty.call(incoming, 'appShowQuote') && typeof quoteValue === 'boolean') {
        localStorage.setItem('fast-show-quote', quoteValue ? '1' : '0');
      } else {
        localStorage.removeItem('fast-show-quote');
      }

      const newsValue = incoming['appShowNews'];
      if (Object.prototype.hasOwnProperty.call(incoming, 'appShowNews') && typeof newsValue === 'boolean') {
        localStorage.setItem('fast-show-news', newsValue ? '1' : '0');
      } else {
        localStorage.removeItem('fast-show-news');
      }

      const todoValue = incoming['appShowTodo'];
      if (Object.prototype.hasOwnProperty.call(incoming, 'appShowTodo') && typeof todoValue === 'boolean') {
        localStorage.setItem('fast-show-todo', todoValue ? '1' : '0');
      } else {
        localStorage.removeItem('fast-show-todo');
      }
    }
  } catch (err) {
    // Ignore; mirrors are best-effort only
  }

  if (typeof showCustomDialog === 'function') {
    showCustomDialog('Import complete', 'Homebase settings have been restored. Reloading...');
  }
  window.location.reload();
}

window.HomebaseBackup = {
  exportState: exportHomebaseState,
  importState: importHomebaseState
};
