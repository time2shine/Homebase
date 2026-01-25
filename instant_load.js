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

    // --- 5. Instant To-Do ---
    const todoWidget = document.querySelector('.widget-todo');
    if (todoWidget) {
      const todoList = $('todo-list');
      const todoHideDone = $('todo-hide-done');
      if (todoList) {
        const tRaw = localStorage.getItem('fast-todo');
        if (tRaw) {
          let todoState = null;
          try {
            todoState = JSON.parse(tRaw);
          } catch (e) {
            todoState = null;
          }
          if (todoState && Array.isArray(todoState.items)) {
            const cachedTs = Number(todoState.__timestamp);
            if (Number.isFinite(cachedTs) && (Date.now() - cachedTs > 30 * 24 * 60 * 60 * 1000)) {
              // Stale cache; skip instant render.
            } else {
              const items = todoState.items.map((item) => {
                const text = item && typeof item.text === 'string' ? item.text.trim() : '';
                if (!text) return null;
                return {
                  id: item && typeof item.id === 'string' ? item.id : '',
                  text,
                  done: item && item.done === true
                };
              }).filter(Boolean);
              const hideDone = todoState.hideDone === true;
              const visibleItems = hideDone ? items.filter((item) => !item.done) : items;

              if (todoHideDone) {
                todoHideDone.checked = hideDone;
              }

              todoList.innerHTML = '';
              if (visibleItems.length === 0) {
                const empty = document.createElement('li');
                empty.className = 'todo-empty';
                empty.textContent = (items.length > 0 && hideDone) ? 'No active tasks' : 'No tasks yet';
                todoList.appendChild(empty);
              } else {
                visibleItems.forEach((item) => {
                  const li = document.createElement('li');
                  li.className = 'todo-item';
                  if (item.done) li.classList.add('done');

                  const label = document.createElement('label');
                  label.className = 'todo-item-main';

                  const toggle = document.createElement('input');
                  toggle.type = 'checkbox';
                  toggle.className = 'todo-toggle';
                  toggle.checked = item.done === true;
                  toggle.dataset.todoId = item.id;

                  const text = document.createElement('span');
                  text.className = 'todo-text';
                  text.textContent = item.text;

                  label.appendChild(toggle);
                  label.appendChild(text);

                  const delBtn = document.createElement('button');
                  delBtn.type = 'button';
                  delBtn.className = 'todo-delete-btn';
                  delBtn.dataset.todoId = item.id;
                  delBtn.setAttribute('aria-label', 'Delete task');
                  delBtn.textContent = 'Delete';

                  li.appendChild(label);
                  li.appendChild(delBtn);
                  todoList.appendChild(li);
                });
              }

              showWidget(todoWidget);
            }
          }
        }
      }
    }

    // --- 6. Instant News ---
    function formatNewsUpdated(timestamp) {
      if (!timestamp) return '';
      const date = new Date(timestamp);
      if (Number.isNaN(date.getTime())) return '';
      return `Updated: ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }

    function formatTimeAgo(timestampMs) {
      if (!timestampMs) return '';
      const parsed = Number(timestampMs);
      if (!Number.isFinite(parsed)) return '';
      const diffMs = Math.max(0, Date.now() - parsed);
      const diffSeconds = Math.floor(diffMs / 1000);
      if (diffSeconds < 60) return 'just now';
      const diffMinutes = Math.floor(diffSeconds / 60);
      if (diffMinutes < 60) return `${diffMinutes}m ago`;
      const diffHours = Math.floor(diffMinutes / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      const diffDays = Math.floor(diffHours / 24);
      return `${diffDays}d ago`;
    }

    function orderNewsItems(items, { minDatedRatio }) {
      const list = Array.isArray(items) ? items.slice() : [];
      if (!list.length) return list;
      let datedCount = 0;
      for (const item of list) {
        const parsed = Number(item && item.publishedAt);
        if (Number.isFinite(parsed)) {
          datedCount += 1;
        }
      }
      const ratio = list.length ? datedCount / list.length : 0;
      const minRatio = typeof minDatedRatio === 'number' ? minDatedRatio : 0;
      if (ratio < minRatio) return list;
      const indexed = list.map((item, index) => {
        const parsed = Number(item && item.publishedAt);
        return {
          item,
          index,
          publishedAt: Number.isFinite(parsed) ? parsed : -Infinity
        };
      });
      indexed.sort((a, b) => {
        if (b.publishedAt !== a.publishedAt) return b.publishedAt - a.publishedAt;
        return a.index - b.index;
      });
      return indexed.map((entry) => entry.item);
    }

    const nRaw = localStorage.getItem('fast-news');
    if (nRaw) {
      let newsState = null;
      try {
        newsState = JSON.parse(nRaw);
      } catch (e) {
        newsState = null;
      }
      if (newsState && newsState.__timestamp && Array.isArray(newsState.items)) {
        const isFresh = (Date.now() - newsState.__timestamp) < 1800000;
        if (isFresh) {
          let allowNewsInstant = false;
          try {
            allowNewsInstant = localStorage.getItem('fast-show-news') === '1';
          } catch (e) {
            allowNewsInstant = false;
          }
          if (allowNewsInstant) {
            const newsList = $('news-list');
            const newsUpdated = $('news-updated');
            const newsWidget = document.querySelector('.widget-news');
            const orderedItems = orderNewsItems(newsState.items, { minDatedRatio: 0.6 });
            const items = orderedItems.slice(0, 5).map((item) => ({
              title: String((item && item.title) || ''),
              link: String((item && item.link) || ''),
              description: String((item && item.description) || ''),
              image: String((item && item.image) || ''),
              publishedAt: item && item.publishedAt != null ? item.publishedAt : ''
            })).filter((item) => item.title && item.link);
            if (newsList) {
              newsList.innerHTML = '';
              items.forEach((item) => {
                const title = item.title;
                const link = item.link;
                const description = item.description;
                const image = item.image;
                const timeAgo = formatTimeAgo(item.publishedAt);

                const li = document.createElement('li');
                li.className = 'news-item';
                li.dataset.newsTitle = title;
                li.dataset.newsDesc = description;
                li.dataset.newsImage = image;
                li.dataset.newsLink = link;

                const a = document.createElement('a');
                a.className = 'news-title';
                a.href = link;
                a.target = '_blank';
                a.rel = 'noreferrer noopener';
                a.textContent = title;
                li.appendChild(a);

                if (timeAgo) {
                  const meta = document.createElement('div');
                  meta.className = 'news-meta';
                  const time = document.createElement('span');
                  time.className = 'news-time';
                  time.textContent = timeAgo;
                  meta.appendChild(time);
                  li.appendChild(meta);
                }
                newsList.appendChild(li);
              });
            }
            if (newsUpdated) {
              setText(newsUpdated, formatNewsUpdated(newsState.__timestamp));
            }
            if (items.length) {
              showWidget(newsWidget);
            }
          }
        }
      }
    }

  } catch (e) {
    console.warn("Instant load error:", e);
  }
})();
