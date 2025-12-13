(function() {
  try {
    // --- 1. Instant Clock ---
    const nowTime = new Date();
    const timeEl = document.getElementById('current-time');
    const dateEl = document.getElementById('current-date');
    const timeWidget = document.querySelector('.widget-time');

    // FIX: Check localStorage for 24-hour preference
    let use12Hour = true; 
    try {
      const storedFmt = localStorage.getItem('fast-time-format');
      if (storedFmt === '24-hour') use12Hour = false;
    } catch (e) {}

    if (timeEl) timeEl.textContent = nowTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: use12Hour });
    if (dateEl) dateEl.textContent = nowTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

    if (timeWidget) {
      timeWidget.classList.remove('widget-hidden');
      timeWidget.classList.add('widget-visible');
    }

    // --- 2. Instant Weather (FIXED KEY MAPPING) ---
    const wData = localStorage.getItem('fast-weather');
    if (wData) {
      const w = JSON.parse(wData);
      // Valid for 1 hour
      if (w.__timestamp && (Date.now() - w.__timestamp < 3600000)) {
        
        // Map DOM IDs to the exact JSON keys saved in new-tab.js
        const fieldMap = {
          'weather-city': 'city',
          'weather-temp': 'temp',
          'weather-desc': 'desc',
          'weather-icon': 'icon',
          'weather-pressure': 'pressure',
          'weather-humidity': 'humidity',
          'weather-cloudcover': 'cloudcover',
          'weather-precip-prob': 'precipProb', // <--- Fixed this key
          'weather-sunrise': 'sunrise',
          'weather-sunset': 'sunset'
        };

        Object.keys(fieldMap).forEach(id => {
          const key = fieldMap[id];
          const val = w[key];
          const el = document.getElementById(id);

          if (id === 'weather-icon') {
             if (el && val) { 
               el.textContent = val; 
               el.style.fontSize = '3.5em'; 
               el.style.lineHeight = '1'; 
             }
          } else if (el && val) {
             el.textContent = val;
          }
        });

        const wWidget = document.querySelector('.widget-weather');
        if (wWidget) {
          wWidget.classList.remove('widget-hidden');
          wWidget.classList.add('widget-visible');
        }
      }
    }

    // --- 3. Instant Search ---
    const sData = localStorage.getItem('fast-search');
    if (sData) {
      const s = JSON.parse(sData);
      const searchWidget = document.querySelector('.widget-search');
      const searchInput = document.getElementById('search-input');
      const searchSelector = document.getElementById('search-engine-selector');

      if (searchWidget && searchInput && searchSelector) {
        if (s.placeholder) searchInput.placeholder = s.placeholder;
        if (s.selectorHtml) {
          searchSelector.innerHTML = s.selectorHtml;
          searchSelector.style.setProperty('--collapsed-width', '42px');
          searchSelector.style.setProperty('--expanded-width', '42px');
        }
        searchWidget.classList.remove('widget-hidden');
        searchWidget.style.opacity = '1';
        searchWidget.style.transform = 'translateY(0)';
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
        const qText = document.getElementById('quote-text');
        const qAuthor = document.getElementById('quote-author');
        const qWidget = document.querySelector('.widget-quote');

        if (qText) qText.textContent = `"${state.current.text}"`;
        if (qAuthor) qAuthor.textContent = state.current.author ? `- ${state.current.author}` : '';
        
        if (qWidget) {
          qWidget.classList.remove('widget-hidden');
          qWidget.classList.add('widget-visible');
        }
      }
    }

  } catch (e) {
    console.warn("Instant load error:", e);
  }
})();
