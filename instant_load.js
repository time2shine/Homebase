(function() {
  try {
    // --- 1. Instant Clock (Keep existing logic) ---
    const nowTime = new Date();
    const timeEl = document.getElementById('current-time');
    const dateEl = document.getElementById('current-date');
    const timeWidget = document.querySelector('.widget-time');

    if (timeEl) timeEl.textContent = nowTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
    if (dateEl) dateEl.textContent = nowTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

    if (timeWidget) {
      timeWidget.classList.remove('widget-hidden');
      timeWidget.classList.add('widget-visible');
    }

    // --- 2. Instant Weather (Keep existing logic) ---
    const wData = localStorage.getItem('fast-weather');
    if (wData) {
      const w = JSON.parse(wData);
      // Valid for 1 hour
      if (w.__timestamp && (Date.now() - w.__timestamp < 3600000)) {
        const ids = ['weather-city','weather-temp','weather-desc','weather-icon',
                     'weather-pressure','weather-humidity','weather-cloudcover',
                     'weather-precip-prob','weather-sunrise','weather-sunset'];
        
        ids.forEach(id => {
          const el = document.getElementById(id);
          const key = id.replace('weather-', '');
          // Map specific keys if needed, or assume direct match
          let val = w[key === 'city' ? 'city' : key]; 
          if (id === 'weather-icon') {
             if (el) { el.textContent = w.icon; el.style.fontSize = '3.5em'; el.style.lineHeight = '1'; }
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

    // --- 3. Instant Search (Keep existing logic) ---
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

    // --- 4. Instant Quote (REBUILT: Promote Strategy) ---
    // Architecture: { current: {text, author}, next: {text, author}, config: {freq, lastShown} }
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

      // PROMOTE: If valid next quote exists and time is up, swap it NOW.
      if (shouldRotate && state.next && state.next.text) {
        state.current = state.next;
        state.next = null; // Clear next so new-tab.js knows to refill
        state.config.lastShown = now;
        
        // Save synchronously so new-tab.js sees the update
        localStorage.setItem('fast-quote-state', JSON.stringify(state));
      }

      // RENDER: Always render 'current'. It is now guaranteed to be the correct one.
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
