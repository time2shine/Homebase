window.HOMEBASE_TIPS = [
  {
    "id": "search-math",
    "title": "Instant math in the search bar",
    "body": "Type an expression like `12*7` (or start with `=`) and Homebase can treat it as a calculator/search helper (toggleable in Settings).",
    "tags": [
      "search",
      "productivity"
    ],
    "settingKeys": [
      "APP_SEARCH_MATH_KEY"
    ]
  },
  {
    "id": "search-history-toggle",
    "title": "Search suggestions from your history",
    "body": "If you want smarter suggestions, enable the setting that allows history-powered suggestions (and disable it when you want maximum privacy).",
    "tags": [
      "search",
      "privacy"
    ],
    "settingIds": [
      "app-search-history-toggle"
    ]
  },
  {
    "id": "remember-search-engine",
    "title": "Keep your last-used search engine",
    "body": "Enable \u201cRemember search engine\u201d so the next new tab restores the engine you last used.",
    "tags": [
      "search"
    ],
    "settingIds": [
      "app-search-remember-engine-toggle",
      "app-search-default-engine-select"
    ]
  },
  {
    "id": "homebase-folder-auto",
    "title": "Homebase auto-finds your bookmarks folder",
    "body": "Homebase looks for a \u201cHomebase\u201d folder under \u201cOther Bookmarks\u201d and uses it automatically; you can still pick a different folder in Settings anytime.",
    "tags": [
      "bookmarks"
    ]
  },
  {
    "id": "bookmark-tabs-dnd",
    "title": "Drag folder tabs to reorder",
    "body": "Reorder your bookmark folder tabs with drag-and-drop. It\u2019s built to avoid click misfires while dragging.",
    "tags": [
      "bookmarks",
      "ui"
    ]
  },
  {
    "id": "bookmark-grid-dnd",
    "title": "Drag-and-drop inside the bookmarks grid",
    "body": "Rearrange items in the bookmarks grid with drag-and-drop. Folder hover delay lets you drop into folders without accidental opens.",
    "tags": [
      "bookmarks",
      "ui"
    ]
  },
  {
    "id": "virtualization",
    "title": "Big bookmark folders stay fast",
    "body": "Homebase can virtualize bookmark rendering so huge folders don\u2019t bog down the DOM\u2014handy if you keep hundreds of links.",
    "tags": [
      "performance",
      "bookmarks"
    ]
  },
  {
    "id": "perf-overlay",
    "title": "Performance overlay for debugging",
    "body": "There\u2019s a debug performance overlay option that tracks render time, virtualized range, and cache/localStorage usage.",
    "tags": [
      "performance",
      "debug"
    ],
    "settingKeys": [
      "APP_DEBUG_PERF_OVERLAY_KEY"
    ]
  },
  {
    "id": "sidebar-widgets",
    "title": "Widget sidebar is optional",
    "body": "You can toggle the entire widget sidebar, and also hide/show individual widgets like Weather, Quote, News, and Todo.",
    "tags": [
      "widgets",
      "ui"
    ],
    "settingKeys": [
      "APP_SHOW_SIDEBAR_KEY",
      "APP_SHOW_WEATHER_KEY",
      "APP_SHOW_QUOTE_KEY",
      "APP_SHOW_NEWS_KEY",
      "APP_SHOW_TODO_KEY"
    ]
  },
  {
    "id": "instant-load-sidebar",
    "title": "Faster loads via instant-load state",
    "body": "Homebase mirrors some settings and widget summaries into localStorage so the page can paint instantly before async storage completes.",
    "tags": [
      "performance"
    ]
  },
  {
    "id": "weather-location-search",
    "title": "Weather location search",
    "body": "Use the weather settings dialog to search for a city (geocoding) or switch back to Current Location.",
    "tags": [
      "weather"
    ]
  },
  {
    "id": "weather-units",
    "title": "Switch Celsius/Fahrenheit",
    "body": "Weather units can be toggled (stored in extension storage), and Homebase also caches a compact weather summary for instant display.",
    "tags": [
      "weather",
      "performance"
    ]
  },
  {
    "id": "news-sources",
    "title": "Pick your news source",
    "body": "News fetching supports multiple sources (stored as a preference). If you prefer a quieter new tab, keep News disabled.",
    "tags": [
      "news",
      "widgets"
    ],
    "settingKeys": [
      "APP_NEWS_SOURCE_KEY",
      "APP_SHOW_NEWS_KEY"
    ]
  },
  {
    "id": "todo-enter",
    "title": "Todo: press Enter to add",
    "body": "In the Todo widget, hit Enter in the input to add an item quickly. You can also clear completed items and filter active vs all.",
    "tags": [
      "todo",
      "productivity"
    ]
  },
  {
    "id": "backup-export",
    "title": "Export your Homebase setup",
    "body": "Use \u201cExport Homebase (JSON)\u201d to download a backup of your Homebase-owned settings and caches.",
    "tags": [
      "backup"
    ]
  },
  {
    "id": "backup-import",
    "title": "Import a backup (and refresh fast caches)",
    "body": "Importing a Homebase backup restores settings and also repopulates fast localStorage mirrors like background dim and widget visibility for instant-load.",
    "tags": [
      "backup",
      "performance"
    ]
  },
  {
    "id": "wallpaper-daily-rotation",
    "title": "Daily wallpaper rotation",
    "body": "Turn on Daily Rotation to automatically change the wallpaper every day.",
    "tags": [
      "wallpaper"
    ],
    "settingIds": [
      "app-daily-toggle"
    ]
  },
  {
    "id": "wallpaper-type",
    "title": "Choose Live vs Static wallpapers",
    "body": "Prefer Live (Video) wallpapers or Static images using the Wallpaper Type setting.",
    "tags": [
      "wallpaper"
    ],
    "settingIds": [
      "app-wallpaper-type-select"
    ]
  },
  {
    "id": "wallpaper-quality",
    "title": "Wallpaper quality control",
    "body": "If bandwidth matters, switch Wallpaper Quality to Low (720p).",
    "tags": [
      "wallpaper"
    ],
    "settingIds": [
      "app-wallpaper-quality-select"
    ]
  },
  {
    "id": "dynamic-accent",
    "title": "Dynamic accent color from wallpaper",
    "body": "Homebase can compute an average color from your current wallpaper and apply it as a dynamic accent for a cohesive look.",
    "tags": [
      "ui",
      "wallpaper"
    ]
  },
  {
    "id": "tab-singleton",
    "title": "Jump to existing Homebase tab",
    "body": "Enable \u201cJump to existing tab\u201d so opening a new tab switches to an existing Homebase tab (per container) instead of creating duplicates.",
    "tags": [
      "tabs"
    ],
    "settingKeys": [
      "APP_SINGLETON_MODE_KEY"
    ]
  },
  {
    "id": "tab-limits",
    "title": "Auto-close extra/inactive Homebase tabs",
    "body": "Set \u201cMax open Homebase tabs\u201d and/or \u201cClose inactive tabs after\u201d to keep your tab bar clean automatically.",
    "tags": [
      "tabs",
      "productivity"
    ],
    "settingKeys": [
      "APP_MAX_TABS_KEY",
      "APP_AUTOCLOSE_KEY"
    ]
  },
  {
    "id": "containers",
    "title": "Firefox Containers support",
    "body": "If you use Firefox Containers, you can enable Container Mode and choose whether Homebase stays open in the background or closes when opening in a container.",
    "tags": [
      "tabs",
      "firefox"
    ],
    "settingIds": [
      "app-container-mode-toggle"
    ]
  }
];
