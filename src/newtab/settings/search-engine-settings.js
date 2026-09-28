function setupSearchEnginesModal() {

  const modal = document.getElementById('search-engines-modal');

  const openBtn = document.getElementById('manage-search-engines-btn');

  const saveBtn = document.getElementById('search-engines-save-btn');

  const cancelBtn = document.getElementById('search-engines-cancel-btn');

  const listContainer = document.getElementById('search-engines-modal-list');



  if (!modal || !openBtn || !saveBtn || !cancelBtn || !listContainer) return;



  const closeModal = () => {

    closeModalWithAnimation('search-engines-modal', '.dialog-content');

  };



  // Sortable instance variable

  let engineSortable = null;



  const renderList = () => {

    listContainer.replaceChildren();

    

    // Sort engines: enabled first, then disabled (optional, but good UX) 

    // or just keep original order. Here we use the current 'searchEngines' order.

    searchEngines.forEach((engine) => {

      const div = document.createElement('div');

      div.className = 'engine-toggle-item';

      const main = document.createElement('div');
      main.className = 'engine-toggle-main';

      const dragHandle = document.createElement('span');
      dragHandle.className = 'engine-drag-handle';
      dragHandle.setAttribute('aria-hidden', 'true');
      dragHandle.textContent = String.fromCharCode(9776);

      const iconWrap = document.createElement('span');
      iconWrap.className = 'engine-toggle-icon';
      iconWrap.setAttribute('aria-hidden', 'true');
      const iconEl = engine.symbolId ? createSvgIconElement(engine.symbolId) : null;
      if (iconEl) {
        iconWrap.appendChild(iconEl);
      } else {
        const fallback = document.createElement('span');
        fallback.style.fontWeight = 'bold';
        fallback.style.fontSize = '12px';
        fallback.style.color = '#555';
        fallback.textContent = (engine.name || '').charAt(0);
        iconWrap.appendChild(fallback);
      }

      const name = document.createElement('span');
      name.className = 'engine-toggle-name';
      name.textContent = engine.name;

      main.appendChild(dragHandle);
      main.appendChild(iconWrap);
      main.appendChild(name);

      const label = document.createElement('label');
      label.className = 'app-switch';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'engine-toggle-checkbox';
      checkbox.dataset.id = engine.id;
      checkbox.checked = engine.enabled === true;

      const track = document.createElement('span');
      track.className = 'app-switch-track';

      label.appendChild(checkbox);
      label.appendChild(track);

      div.appendChild(main);
      div.appendChild(label);



      // --- NEW FEATURE: Prevent Disabling Last Engine ---

      checkbox.addEventListener('change', (e) => {

        // Count how many are CURRENTLY checked in the DOM

        const allCheckboxes = listContainer.querySelectorAll('.engine-toggle-checkbox');

        const checkedCount = Array.from(allCheckboxes).filter(cb => cb.checked).length;



        if (checkedCount === 0) {

          // If the user just unchecked the last one, revert it immediately

          e.preventDefault();

          checkbox.checked = true;

          showCustomAlert("You must have at least one search engine enabled.");

        }

      });

      // --------------------------------------------------



      listContainer.appendChild(div);

    });



    // Initialize Sortable on the list

    if (engineSortable) engineSortable.destroy();

    engineSortable = initUnifiedSortable(listContainer, null, {}, 'searchEngines');

  };



  openBtn.addEventListener('click', async () => {

    try {

      await loadSearchEnginePreferences();

    } catch (err) {

      console.warn('Failed to refresh search engines before opening modal', err);

    }

    renderList();

    openModalWithAnimation('search-engines-modal', 'manage-search-engines-btn', '.dialog-content');

  });



  saveBtn.addEventListener('click', async () => {

    // 1. Read the new order from the DOM

    const items = listContainer.querySelectorAll('.engine-toggle-item');

    const newOrderConfig = [];



    items.forEach(item => {

      const checkbox = item.querySelector('.engine-toggle-checkbox');

      newOrderConfig.push({

        id: checkbox.dataset.id,

        enabled: checkbox.checked

      });

    });



    // 2. Re-sort the global 'searchEngines' array based on this new order

    const newSearchEngines = newOrderConfig.map(cfg => {

      // Find the original engine object to preserve URLs/Icons

      const original = searchEngines.find(e => e.id === cfg.id);

      if (original) {

        original.enabled = cfg.enabled;

        return original;

      }

      return null;

    }).filter(Boolean);



    // Append any engines that might have been missing from the list (safety fallback)

    const seenIds = new Set(newSearchEngines.map(e => e.id));

    searchEngines.forEach(e => {

      if (!seenIds.has(e.id)) newSearchEngines.push(e);

    });



    // Update Global Variable

    searchEngines = newSearchEngines;



    // 3. Save the ORDERED list to storage

    // We save an array of {id, enabled} objects

    const storageData = searchEngines.map(e => ({ id: e.id, enabled: e.enabled }));



    try {
      if (typeof HomebaseStorage !== 'undefined' && HomebaseStorage.set) {
        await HomebaseStorage.set(SEARCH_ENGINES_PREF_KEY, storageData);
      } else if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
        await browser.storage.local.set({ [SEARCH_ENGINES_PREF_KEY]: storageData });
      }
    } catch (err) {
      console.warn('Failed to save search engines', err);
    }



    const previousDefaultEngineId = appSearchDefaultEnginePreference;

    const defaultEngineId = populateDefaultEngineSelectControl();

    if (defaultEngineId && previousDefaultEngineId !== defaultEngineId) {

      try {
        if (typeof HomebaseStorage !== 'undefined' && HomebaseStorage.set) {
          await HomebaseStorage.set(APP_SEARCH_DEFAULT_ENGINE_KEY, defaultEngineId);
        } else if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
          await browser.storage.local.set({ [APP_SEARCH_DEFAULT_ENGINE_KEY]: defaultEngineId });
        }
      } catch (err) {
        console.warn('Failed to persist default search engine', err);
      }

    }

    if (!appSearchRememberEnginePreference && defaultEngineId) {

      const defaultEngine = searchEngines.find((engine) => engine.id === defaultEngineId);

      writeFastSearchCache(defaultEngine);

    }



    populateSearchOptions();



    // Handle current engine selection logic

    const currentStillEnabled = searchEngines.find((e) => e.id === currentSearchEngine.id && e.enabled);

    if (!currentStillEnabled) {

      const firstEnabled = searchEngines.find((e) => e.enabled) || searchEngines[0];

      updateSearchUI(firstEnabled.id);

      if (appSearchRememberEnginePreference) {
        const persistPromise = (typeof HomebaseStorage !== 'undefined' && HomebaseStorage.set)
          ? HomebaseStorage.set('currentSearchEngineId', firstEnabled.id)
          : (typeof browser !== 'undefined' && browser.storage && browser.storage.local
              ? browser.storage.local.set({ currentSearchEngineId: firstEnabled.id })
              : Promise.resolve());

        persistPromise.then(() => {
          writeFastSearchCache(firstEnabled);
        }).catch((err) => {
          console.warn('Failed to persist search engine selection', err);
        });
      }

    } else {

      // Even if current is still enabled, call updateSearchUI to refresh position in the list

      updateSearchUI(currentSearchEngine.id, { updateFastCache: appSearchRememberEnginePreference });

    }



    closeModal();

  });



  cancelBtn.addEventListener('click', closeModal);

  modal.addEventListener('click', (e) => {

    if (e.target === modal) closeModal();

  });

}
