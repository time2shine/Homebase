// Bookmark Storage Service
// Coordinates Homebase bookmark root ID, bookmark metadata, folder metadata,
// and last-used folder state via HomebaseStorage with defensive fallback to browser.storage.local.

const HOMEBASE_BOOKMARK_ROOT_ID_KEY = 'homebaseBookmarkRootId';
const BOOKMARK_META_KEY = 'bookmarkCustomMetadata';
const FOLDER_META_KEY = 'folderCustomMetadata';
const LAST_USED_BOOKMARK_FOLDER_KEY = 'lastUsedBookmarkFolderId';

/**
 * Normalizes bookmark metadata dictionary.
 *
 * @param {*} raw
 * @returns {Object} Clean bookmark metadata dictionary
 */
function normalizeBookmarkMetadata(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const clean = {};
  for (const [id, meta] of Object.entries(raw)) {
    if (typeof id !== 'string' || !id || !meta || typeof meta !== 'object' || Array.isArray(meta)) continue;
    const cleanMeta = {};
    if (typeof meta.icon === 'string') cleanMeta.icon = meta.icon.slice(0, 100000);
    if (typeof meta.customTitle === 'string') cleanMeta.customTitle = meta.customTitle.slice(0, 300);
    if (typeof meta.originalUrl === 'string') cleanMeta.originalUrl = meta.originalUrl.slice(0, 4096);
    if (typeof meta.containerId === 'string') cleanMeta.containerId = meta.containerId.slice(0, 64);
    clean[id] = cleanMeta;
  }
  return clean;
}

/**
 * Normalizes folder metadata dictionary.
 *
 * @param {*} raw
 * @returns {Object} Clean folder metadata dictionary
 */
function normalizeFolderMetadata(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const clean = {};
  for (const [id, meta] of Object.entries(raw)) {
    if (typeof id !== 'string' || !id || !meta || typeof meta !== 'object' || Array.isArray(meta)) continue;
    const cleanMeta = {};
    if (typeof meta.color === 'string') cleanMeta.color = meta.color.slice(0, 32);
    if (typeof meta.icon === 'string') cleanMeta.icon = meta.icon.slice(0, 128);
    if (Array.isArray(meta.customOrder)) {
      cleanMeta.customOrder = meta.customOrder.filter((item) => typeof item === 'string').slice(0, 1000);
    }
    clean[id] = cleanMeta;
  }
  return clean;
}

/**
 * Retrieves the Homebase bookmark root folder ID.
 *
 * @returns {Promise<string>} Bookmark folder ID or empty string
 */
async function getHomebaseRootId() {
  try {
    if (typeof window !== 'undefined' && window.HomebaseStorage && typeof window.HomebaseStorage.get === 'function') {
      const val = await window.HomebaseStorage.get(HOMEBASE_BOOKMARK_ROOT_ID_KEY, '');
      return typeof val === 'string' ? val : '';
    }
    if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
      const stored = await browser.storage.local.get(HOMEBASE_BOOKMARK_ROOT_ID_KEY);
      return (stored && typeof stored[HOMEBASE_BOOKMARK_ROOT_ID_KEY] === 'string')
        ? stored[HOMEBASE_BOOKMARK_ROOT_ID_KEY]
        : '';
    }
    return '';
  } catch (err) {
    console.warn('Failed to read homebase root id', err);
    return '';
  }
}

/**
 * Persists the Homebase bookmark root folder ID.
 *
 * @param {string} id - Bookmark folder ID
 * @returns {Promise<void>}
 */
async function setHomebaseRootId(id) {
  const safeId = typeof id === 'string' ? id : '';
  try {
    if (typeof window !== 'undefined' && window.HomebaseStorage && typeof window.HomebaseStorage.set === 'function') {
      await window.HomebaseStorage.set(HOMEBASE_BOOKMARK_ROOT_ID_KEY, safeId);
      return;
    }
    if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
      await browser.storage.local.set({ [HOMEBASE_BOOKMARK_ROOT_ID_KEY]: safeId });
    }
  } catch (err) {
    console.warn('Failed to persist homebase root id', err);
  }
}

/**
 * Clears the Homebase bookmark root folder ID from storage.
 *
 * @returns {Promise<void>}
 */
async function clearHomebaseRootId() {
  try {
    if (typeof window !== 'undefined' && window.HomebaseStorage && typeof window.HomebaseStorage.remove === 'function') {
      await window.HomebaseStorage.remove(HOMEBASE_BOOKMARK_ROOT_ID_KEY);
      return;
    }
    if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
      await browser.storage.local.remove(HOMEBASE_BOOKMARK_ROOT_ID_KEY);
    }
  } catch (err) {
    console.warn('Failed to clear homebase root id', err);
  }
}

/**
 * Loads custom bookmark metadata (icons, titles, container IDs).
 *
 * @returns {Promise<Object>} Bookmark metadata dictionary
 */
async function getBookmarkMetadata() {
  try {
    if (typeof window !== 'undefined' && window.HomebaseStorage && typeof window.HomebaseStorage.get === 'function') {
      const val = await window.HomebaseStorage.get(BOOKMARK_META_KEY, {});
      return normalizeBookmarkMetadata(val);
    }
    if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
      const stored = await browser.storage.local.get(BOOKMARK_META_KEY);
      const val = stored && stored[BOOKMARK_META_KEY];
      return normalizeBookmarkMetadata(val);
    }
    return {};
  } catch (err) {
    console.warn('Failed to load bookmark metadata', err);
    return {};
  }
}

/**
 * Persists custom bookmark metadata.
 *
 * @param {Object} meta - Bookmark metadata dictionary
 * @returns {Promise<void>}
 */
async function setBookmarkMetadata(meta) {
  const payload = normalizeBookmarkMetadata(meta);
  try {
    if (typeof window !== 'undefined' && window.HomebaseStorage && typeof window.HomebaseStorage.set === 'function') {
      await window.HomebaseStorage.set(BOOKMARK_META_KEY, payload);
      return;
    }
    if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
      await browser.storage.local.set({ [BOOKMARK_META_KEY]: payload });
    }
  } catch (err) {
    console.warn('Failed to persist bookmark metadata', err);
  }
}

/**
 * Removes custom bookmark metadata, either for a specific bookmark or all metadata.
 *
 * @param {string} [bookmarkId] - Optional bookmark ID to remove
 * @returns {Promise<void>}
 */
async function removeBookmarkMetadata(bookmarkId) {
  try {
    if (typeof bookmarkId === 'string' && bookmarkId) {
      const current = await getBookmarkMetadata();
      if (current[bookmarkId]) {
        delete current[bookmarkId];
        await setBookmarkMetadata(current);
      }
      return;
    }
    if (typeof window !== 'undefined' && window.HomebaseStorage && typeof window.HomebaseStorage.remove === 'function') {
      await window.HomebaseStorage.remove(BOOKMARK_META_KEY);
      return;
    }
    if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
      await browser.storage.local.remove(BOOKMARK_META_KEY);
    }
  } catch (err) {
    console.warn('Failed to remove bookmark metadata', err);
  }
}

/**
 * Loads custom folder metadata (colors, icons, custom order).
 *
 * @returns {Promise<Object>} Folder metadata dictionary
 */
async function getFolderMetadata() {
  try {
    if (typeof window !== 'undefined' && window.HomebaseStorage && typeof window.HomebaseStorage.get === 'function') {
      const val = await window.HomebaseStorage.get(FOLDER_META_KEY, {});
      return normalizeFolderMetadata(val);
    }
    if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
      const stored = await browser.storage.local.get(FOLDER_META_KEY);
      const val = stored && stored[FOLDER_META_KEY];
      return normalizeFolderMetadata(val);
    }
    return {};
  } catch (err) {
    console.warn('Failed to load folder metadata', err);
    return {};
  }
}

/**
 * Persists custom folder metadata.
 *
 * @param {Object} meta - Folder metadata dictionary
 * @returns {Promise<void>}
 */
async function setFolderMetadata(meta) {
  const payload = normalizeFolderMetadata(meta);
  try {
    if (typeof window !== 'undefined' && window.HomebaseStorage && typeof window.HomebaseStorage.set === 'function') {
      await window.HomebaseStorage.set(FOLDER_META_KEY, payload);
      return;
    }
    if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
      await browser.storage.local.set({ [FOLDER_META_KEY]: payload });
    }
  } catch (err) {
    console.warn('Failed to persist folder metadata', err);
  }
}

/**
 * Loads the last-used bookmark folder ID.
 *
 * @returns {Promise<string|null>} Folder ID or null
 */
async function getLastUsedFolderId() {
  try {
    if (typeof window !== 'undefined' && window.HomebaseStorage && typeof window.HomebaseStorage.get === 'function') {
      const val = await window.HomebaseStorage.get(LAST_USED_BOOKMARK_FOLDER_KEY, null);
      return typeof val === 'string' && val ? val : null;
    }
    if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
      const stored = await browser.storage.local.get(LAST_USED_BOOKMARK_FOLDER_KEY);
      const val = stored && stored[LAST_USED_BOOKMARK_FOLDER_KEY];
      return typeof val === 'string' && val ? val : null;
    }
    return null;
  } catch (err) {
    console.warn('Failed to load last used bookmark folder id', err);
    return null;
  }
}

/**
 * Persists the last-used bookmark folder ID.
 *
 * @param {string|null} id - Folder ID
 * @returns {Promise<void>}
 */
async function setLastUsedFolderIdStorage(id) {
  const safeId = typeof id === 'string' && id ? id : null;
  try {
    if (typeof window !== 'undefined' && window.HomebaseStorage && typeof window.HomebaseStorage.set === 'function') {
      await window.HomebaseStorage.set(LAST_USED_BOOKMARK_FOLDER_KEY, safeId);
      return;
    }
    if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
      await browser.storage.local.set({ [LAST_USED_BOOKMARK_FOLDER_KEY]: safeId });
    }
  } catch (err) {
    console.warn('Failed to persist last used folder id', err);
  }
}

if (typeof window !== 'undefined') {
  window.HOMEBASE_BOOKMARK_ROOT_ID_KEY = HOMEBASE_BOOKMARK_ROOT_ID_KEY;
  window.BOOKMARK_META_KEY = BOOKMARK_META_KEY;
  window.FOLDER_META_KEY = FOLDER_META_KEY;
  window.LAST_USED_BOOKMARK_FOLDER_KEY = LAST_USED_BOOKMARK_FOLDER_KEY;

  window.normalizeBookmarkMetadata = normalizeBookmarkMetadata;
  window.normalizeFolderMetadata = normalizeFolderMetadata;

  window.getHomebaseRootId = getHomebaseRootId;
  window.setHomebaseRootId = setHomebaseRootId;
  window.clearHomebaseRootId = clearHomebaseRootId;

  window.getBookmarkMetadata = getBookmarkMetadata;
  window.setBookmarkMetadata = setBookmarkMetadata;
  window.removeBookmarkMetadata = removeBookmarkMetadata;

  window.getFolderMetadata = getFolderMetadata;
  window.setFolderMetadata = setFolderMetadata;

  window.getLastUsedFolderId = getLastUsedFolderId;
  window.setBookmarkLastUsedFolderId = setLastUsedFolderIdStorage;
  window.setLastUsedFolderIdStorage = setLastUsedFolderIdStorage;

  window.HomebaseBookmarkStorage = {
    HOMEBASE_BOOKMARK_ROOT_ID_KEY,
    BOOKMARK_META_KEY,
    FOLDER_META_KEY,
    LAST_USED_BOOKMARK_FOLDER_KEY,
    normalizeBookmarkMetadata,
    normalizeFolderMetadata,
    getHomebaseRootId,
    setHomebaseRootId,
    clearHomebaseRootId,
    getBookmarkMetadata,
    setBookmarkMetadata,
    removeBookmarkMetadata,
    getFolderMetadata,
    setFolderMetadata,
    getLastUsedFolderId,
    setLastUsedFolderId: setLastUsedFolderIdStorage
  };
}
