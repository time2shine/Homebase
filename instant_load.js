(function() {
  try {
    const CACHE_TTL = 3600000; // 1 hour

    // --- 1. Instant Clock ---
    const now = new Date();
    const timeEl = document.getElementById('current-time');
    const dateEl = document.getElementById('current-date');
    const timeWidget = document.querySelector('.widget-time');

    // Default to 12-hour for instant render (JS will correct preference later)
    if (timeEl) timeEl.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
    if (dateEl) dateEl.textContent = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

    // FIX: Immediately reveal the clock widget
    if (timeWidget) {
      timeWidget.classList.remove('widget-hidden');
      timeWidget.classList.add('widget-visible');
    }

    // --- 2. Instant Weather ---
    const wData = localStorage.getItem('fast-weather');
    if (wData) {
      const w = JSON.parse(wData);

      // Bail if cache is stale
      if (!w.__timestamp || Date.now() - w.__timestamp > CACHE_TTL) {
        console.log('Instant weather cache expired.');
      } else {
        const cityEl = document.getElementById('weather-city');
        const tempEl = document.getElementById('weather-temp');
        const descEl = document.getElementById('weather-desc');
        const iconEl = document.getElementById('weather-icon');
        const pressureEl = document.getElementById('weather-pressure');
        const humidityEl = document.getElementById('weather-humidity');
        const cloudcoverEl = document.getElementById('weather-cloudcover');
        const precipProbEl = document.getElementById('weather-precip-prob');
        const sunriseEl = document.getElementById('weather-sunrise');
        const sunsetEl = document.getElementById('weather-sunset');
        
        // Basic Info
        if (cityEl) cityEl.textContent = w.city;
        if (tempEl) tempEl.textContent = w.temp;
        if (descEl) descEl.textContent = w.desc;

        if (iconEl) {
          iconEl.textContent = w.icon;
          iconEl.style.fontSize = '3.5em';
          iconEl.style.lineHeight = '1';
        }

        // Detailed Stats
        if (pressureEl && w.pressure) pressureEl.textContent = w.pressure;
        if (humidityEl && w.humidity) humidityEl.textContent = w.humidity;
        if (cloudcoverEl && w.cloudcover) cloudcoverEl.textContent = w.cloudcover;
        if (precipProbEl && w.precipProb) precipProbEl.textContent = w.precipProb;
        if (sunriseEl && w.sunrise) sunriseEl.textContent = w.sunrise;
        if (sunsetEl && w.sunset) sunsetEl.textContent = w.sunset;

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
        if (s.placeholder) {
          searchInput.placeholder = s.placeholder;
        }

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
    const qData = localStorage.getItem('fast-quote');
    if (qData) {
      const q = JSON.parse(qData);
      const qText = document.getElementById('quote-text');
      const qAuthor = document.getElementById('quote-author');
      
      if (qText) qText.textContent = '\"' + q.text + '\"';
      if (qAuthor) qAuthor.textContent = q.author ? '- ' + q.author : '';

      const qWidget = document.querySelector('.widget-quote');
      if (qWidget) {
        qWidget.classList.remove('widget-hidden');
        qWidget.classList.add('widget-visible');
      }
    }

  } catch (e) {
    // If anything fails, the main JS will handle it normally a few ms later.
    console.warn("Instant load script skipped:", e);
  }
})();
