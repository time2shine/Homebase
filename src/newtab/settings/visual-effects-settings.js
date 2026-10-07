/**
 * Setup Animation Modal Logic (Updated for Hover Previews)
 */
function setupAnimationSettings() {
  const modal = document.getElementById('animation-settings-modal');
  const openBtn = document.getElementById('app-configure-animation-btn');
  const closeBtn = document.getElementById('animation-settings-close-btn');
  const cancelBtn = document.getElementById('animation-settings-cancel-btn');
  const saveBtn = document.getElementById('animation-settings-save-btn');
  const list = document.getElementById('animation-list');
  const previewItems = document.querySelectorAll('.animation-preview-item');

  // Track the actual "saved" or "clicked" selection
  let selectedKey = appGridAnimationPreference;

  const closeModal = () => {
    closeModalWithAnimation('animation-settings-modal', '.dialog-content', () => {
      // Restore the real selection if the user hovered over others but didn't save
      if (appGridAnimationPreference !== selectedKey) {
        applyGridAnimation(appGridAnimationPreference);
      }
    });
  };

  const playPreview = () => {
    if (isPerformanceModeEnabled()) return;
    previewItems.forEach((item, index) => {
      // Reset animation to force a replay
      item.style.animation = 'none';
      item.offsetHeight; /* trigger reflow */
      
      // Apply new animation
      const delay = index * 100;
      item.style.animation = `item-fade-in 0.6s cubic-bezier(0.25, 0.8, 0.4, 1) ${delay}ms forwards`;
    });
  };

  if (openBtn) {
    openBtn.addEventListener('click', () => {
      if (isPerformanceModeEnabled()) {
        console.warn('Performance Mode is on; animation settings are disabled.');
        return;
      }
      selectedKey = appGridAnimationPreference;
      
      // Build List
      list.innerHTML = '';
      Object.entries(GRID_ANIMATIONS).forEach(([key, data]) => {
        const btn = document.createElement('div');
        btn.className = 'animation-option';
        btn.textContent = data.name;
        if (key === selectedKey) btn.classList.add('selected');
        
        // 1. Hover: Preview immediately without selecting
        btn.addEventListener('mouseenter', () => {
          applyGridAnimation(key); // Temporarily swap global CSS
          playPreview();           // Run the visual test
        });

        // 2. Hover Out: Revert to the actually selected item
        // This ensures if you mouse away, the page doesn't stay stuck on the previewed one
        btn.addEventListener('mouseleave', () => {
          applyGridAnimation(selectedKey);
        });

        // 3. Click: Confirm Selection (Highlight Blue)
        btn.addEventListener('click', () => {
          list.querySelectorAll('.animation-option').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          selectedKey = key;
          
          // Re-apply to lock it in as the "restore point" for mouseleave
          applyGridAnimation(selectedKey);
          playPreview(); 
        });
        
        list.appendChild(btn);
      });

      openModalWithAnimation('animation-settings-modal', 'app-configure-animation-btn', '.dialog-content');
      playPreview();
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      appGridAnimationPreference = selectedKey;
      if (typeof HomebaseStorage !== 'undefined' && HomebaseStorage.set) {
        await HomebaseStorage.set(APP_GRID_ANIMATION_KEY, selectedKey);
      } else if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
        await browser.storage.local.set({ [APP_GRID_ANIMATION_KEY]: selectedKey });
      }
      
      // Update actual grid immediately if visible
      if (currentGridFolderNode) {
        const node = findBookmarkNodeById(bookmarkTree[0], currentGridFolderNode.id);
        if (node) renderBookmarkGrid(node);
      }
      
      closeModalWithAnimation('animation-settings-modal', '.dialog-content');
    });
  }

  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (cancelBtn) cancelBtn.addEventListener('click', () => {
    // Revert visually to the original preference stored in settings
    loadGridAnimationPref(); 
    closeModal();
  });
  if (modal) modal.addEventListener('click', (e) => { if(e.target === modal) closeModal(); });
}



function setupGlassSettings() {
  const modal = document.getElementById('glass-settings-modal');
  const openBtn = document.getElementById('app-configure-glass-btn');
  const closeBtn = document.getElementById('glass-settings-close-btn');
  const cancelBtn = document.getElementById('glass-settings-cancel-btn');
  const saveBtn = document.getElementById('glass-settings-save-btn');
  const list = document.getElementById('glass-style-list');

  // Track selection state
  let selectedId = appGlassStylePreference;

  const closeModal = () => {
    closeModalWithAnimation('glass-settings-modal', '.dialog-content', () => {
      // Revert if cancelled/closed without saving
      if (appGlassStylePreference !== selectedId) {
        applyGlassStyle(appGlassStylePreference);
      }
    });
  };

  if (openBtn) {
    openBtn.addEventListener('click', () => {
      if (isPerformanceModeEnabled()) {
        console.warn('Performance Mode is on; glass settings are disabled.');
        return;
      }
      selectedId = appGlassStylePreference; // Reset to current actual setting
      
      list.innerHTML = '';
      
      GLASS_STYLES.forEach((style) => {
        const btn = document.createElement('div');
        // Reuse animation-option class for consistent look, or use generic option styling
        btn.className = 'animation-option'; 
        btn.textContent = style.name;
        
        if (style.id === selectedId) btn.classList.add('selected');
        
        // 1. Hover: Preview Live
        btn.addEventListener('mouseenter', () => {
          applyGlassStyle(style.id);
        });

        // 2. Leave: Revert to "selected" state
        btn.addEventListener('mouseleave', () => {
          applyGlassStyle(selectedId);
        });

        // 3. Click: Select
        btn.addEventListener('click', () => {
          list.querySelectorAll('.animation-option').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          selectedId = style.id;
          applyGlassStyle(selectedId); // Lock in visual
        });
        
        list.appendChild(btn);
      });

      // Ensure modal sits above settings
      modal.style.zIndex = '2100';
      openModalWithAnimation('glass-settings-modal', 'app-configure-glass-btn', '.dialog-content');
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      appGlassStylePreference = selectedId;
      if (typeof HomebaseStorage !== 'undefined' && HomebaseStorage.set) {
        await HomebaseStorage.set(APP_GLASS_STYLE_KEY, selectedId);
      } else if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
        await browser.storage.local.set({ [APP_GLASS_STYLE_KEY]: selectedId });
      }
      closeModalWithAnimation('glass-settings-modal', '.dialog-content');
    });
  }

  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (cancelBtn) cancelBtn.addEventListener('click', () => {
    // Re-apply original
    loadGlassStylePref();
    closeModal();
  });
  if (modal) modal.addEventListener('click', (e) => { if(e.target === modal) closeModal(); });
}
