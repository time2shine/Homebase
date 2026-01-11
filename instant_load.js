(function() {
  try {
    const elCache = new Map();
    function $(id) {
      if (!elCache.has(id)) {
        elCache.set(id, document.getElementById(id));
      }
      return elCache.get(id);
    }
    function setText(el, next) {
      if (!el) return;
      const nextStr = String(next);
      if (el.textContent !== nextStr) {
        el.textContent = nextStr;
      }
    }
    function addClass(el, cls) {
      if (el) el.classList.add(cls);
    }
    function removeClass(el, cls) {
      if (el) el.classList.remove(cls);
    }
    function showWidget(el) {
      if (!el) return;
      removeClass(el, 'widget-hidden');
      addClass(el, 'widget-visible');
    }

    // --- 1. Instant Clock ---
    const nowTime = new Date();
    const timeEl = $('current-time');
    const dateEl = $('current-date');
    const timeWidget = document.querySelector('.widget-time');

    // FIX: Check localStorage for 24-hour preference
    let use12Hour = true; 
    try {
      const storedFmt = localStorage.getItem('fast-time-format');
      if (storedFmt === '24-hour') use12Hour = false;
    } catch (e) {}

    if (timeEl) setText(timeEl, nowTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: use12Hour }));
    if (dateEl) setText(dateEl, nowTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }));

    showWidget(timeWidget);

    // --- 2. Instant Weather (FIXED KEY MAPPING) ---
    const wData = localStorage.getItem('fast-weather');
    if (wData) {
      const w = JSON.parse(wData);
      // Valid for 1 hour
      if (w.__timestamp && (Date.now() - w.__timestamp < 3600000)) {
        const getUpdatedLabel = () => {
          if (w.updated) return w.updated;
          if (!w.__timestamp) return '';
          const d = new Date(w.__timestamp);
          if (Number.isNaN(d.getTime())) return '';
          return `Updated: ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        };
        
        // Map DOM IDs to the exact JSON keys saved in new-tab.js
        const fieldMap = {
          'weather-city': 'city',
          'weather-temp': 'temp',
          'weather-desc': 'desc',
          'weather-icon': 'icon',
          'weather-pressure': 'pressure',
          'weather-humidity': 'humidity',
          'weather-cloudcover': 'cloudcover',
          'weather-precip-prob': 'precipProb',
          'weather-sunrise': 'sunrise',
          'weather-sunset': 'sunset',
          'weather-updated': 'updated'
        };

        Object.keys(fieldMap).forEach(id => {
          const key = fieldMap[id];
          const val = id === 'weather-updated' ? getUpdatedLabel() : w[key];
          const el = $(id);

          if (id === 'weather-icon') {
             if (el && val) { 
               setText(el, val);
               el.classList.add('is-instant-icon');
             }
          } else if (el && val !== undefined) {
             setText(el, val);
          }
        });

        let allowWeatherInstant = true;
        try {
          allowWeatherInstant = localStorage.getItem('fast-show-weather') !== '0';
        } catch (e) {
          allowWeatherInstant = true;
        }
        if (allowWeatherInstant) {
          const wWidget = document.querySelector('.widget-weather');
          showWidget(wWidget);
        }
      }
    }

    // --- 3. Instant Search ---
    const sData = localStorage.getItem('fast-search');
    if (sData) {
      const s = JSON.parse(sData);
      const searchWidget = document.querySelector('.widget-search');
      const searchInput = $('search-input');
      const searchSelector = $('search-engine-selector');

      if (searchWidget && searchInput && searchSelector) {
        if (s.placeholder) searchInput.placeholder = s.placeholder;
        if (s.selectorHtml) {
          searchSelector.innerHTML = s.selectorHtml;
          searchSelector.classList.add('is-instant-fixed');
        }
        showWidget(searchWidget);
      }
    }

    // --- 4. Instant Quote ---
    const qRaw = localStorage.getItem('fast-quote-state');
    if (qRaw) {
      let state = JSON.parse(qRaw);
      const now = Date.now();
      const freq = state.config?.frequency || 'hourly';
      const lastShown = state.config?.lastShown || 0;
      
      let shouldRotate = false;
      if (freq === 'always') shouldRotate = true;
      else if (freq === 'hourly' && (now - lastShown > 3600 * 1000)) shouldRotate = true;
      else if (freq === 'daily' && (now - lastShown > 86400 * 1000)) shouldRotate = true;

      if (shouldRotate && state.next && state.next.text) {
        state.current = state.next;
        state.next = null; 
        state.config.lastShown = now;
        localStorage.setItem('fast-quote-state', JSON.stringify(state));
      }

      if (state.current && state.current.text) {
        let allowQuoteInstant = true;
        try {
          allowQuoteInstant = localStorage.getItem('fast-show-quote') !== '0';
        } catch (e) {
          allowQuoteInstant = true;
        }
        const qText = $('quote-text');
        const qAuthor = $('quote-author');
        const qWidget = document.querySelector('.widget-quote');

        if (qText) setText(qText, `"${state.current.text}"`);
        if (qAuthor) setText(qAuthor, state.current.author ? `- ${state.current.author}` : '');

        if (allowQuoteInstant) {
          showWidget(qWidget);
        }
      }
    }

  } catch (e) {
    console.warn("Instant load error:", e);
  }
})();
