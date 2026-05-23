function openBookmarkEditorColorPicker({ button, currentColor, onPick, onPreview, onRevert }) {
  const modal = document.getElementById('material-picker-modal');
  const dialog = modal ? modal.querySelector('.material-picker-dialog') : null;
  const grid = document.getElementById('material-color-grid');

  if (!modal || !dialog || !grid || !button) return;

  button.dataset.value = currentColor;

  const previousSelected = grid.querySelector('.selected');
  if (previousSelected) previousSelected.classList.remove('selected');

  const match = grid.querySelector(`[data-color="${(currentColor || '').toLowerCase()}"]`);
  if (match) match.classList.add('selected');

  materialPickerCallback = onPick;
  materialPreviewCallback = onPreview;
  materialRevertCallback = onRevert;

  modal.classList.remove('hidden');
  modal.style.display = 'block';
  document.body.classList.add('modal-open');

  const rect = button.getBoundingClientRect();
  const dialogWidth = 380;
  const dialogHeight = 420;

  let top = (rect.top + (rect.height / 2)) - (dialogHeight / 2);
  let left = rect.left - dialogWidth - 15;

  if (left < 10) left = rect.right + 15;
  if (top + dialogHeight > window.innerHeight) top = window.innerHeight - dialogHeight - 20;
  if (top < 10) top = 10;

  dialog.style.position = 'absolute';
  dialog.style.margin = '0';
  dialog.style.top = `${top}px`;
  dialog.style.left = `${left}px`;

  const btnCenterX = rect.left + (rect.width / 2);
  const btnCenterY = rect.top + (rect.height / 2);
  const originX = btnCenterX - left;
  const originY = btnCenterY - top;

  grid.style.transformOrigin = `${originX}px ${originY}px`;
}


// ===============================================

// --- MATERIAL COLOR PICKER LOGIC ---

// ===============================================



// 1. Standard Colors (Top Section)

const PALETTE_TOP = [

  { name: 'red', colors: ['#ffebee', '#ffcdd2', '#ef9a9a', '#e57373', '#ef5350', '#f44336', '#e53935', '#d32f2f', '#c62828', '#b71c1c', '#ff8a80', '#ff5252', '#ff1744', '#d50000'] },

  { name: 'pink', colors: ['#fce4ec', '#f8bbd0', '#f48fb1', '#f06292', '#ec407a', '#e91e63', '#d81b60', '#c2185b', '#ad1457', '#880e4f', '#ff80ab', '#ff4081', '#f50057', '#c51162'] },

  { name: 'purple', colors: ['#f3e5f5', '#e1bee7', '#ce93d8', '#ba68c8', '#ab47bc', '#9c27b0', '#8e24aa', '#7b1fa2', '#6a1b9a', '#4a148c', '#ea80fc', '#e040fb', '#d500f9', '#aa00ff'] },

  { name: 'deepPurple', colors: ['#ede7f6', '#d1c4e9', '#b39ddb', '#9575cd', '#7e57c2', '#673ab7', '#5e35b1', '#512da8', '#4527a0', '#311b92', '#b388ff', '#7c4dff', '#651fff', '#6200ea'] },

  { name: 'indigo', colors: ['#e8eaf6', '#c5cae9', '#9fa8da', '#7986cb', '#5c6bc0', '#3f51b5', '#3949ab', '#303f9f', '#283593', '#1a237e', '#8c9eff', '#536dfe', '#3d5afe', '#304ffe'] },

  { name: 'blue', colors: ['#e3f2fd', '#bbdefb', '#90caf9', '#64b5f6', '#42a5f5', '#2196f3', '#1e88e5', '#1976d2', '#1565c0', '#0d47a1', '#82b1ff', '#448aff', '#2979ff', '#2962ff'] },

  { name: 'lightBlue', colors: ['#e1f5fe', '#b3e5fc', '#81d4fa', '#4fc3f7', '#29b6f6', '#03a9f4', '#039be5', '#0288d1', '#0277bd', '#01579b', '#80d8ff', '#40c4ff', '#00b0ff', '#0091ea'] },

  { name: 'cyan', colors: ['#e0f7fa', '#b2ebf2', '#80deea', '#4dd0e1', '#26c6da', '#00bcd4', '#00acc1', '#0097a7', '#00838f', '#006064', '#84ffff', '#18ffff', '#00e5ff', '#00b8d4'] },

  { name: 'teal', colors: ['#e0f2f1', '#b2dfdb', '#80cbc4', '#4db6ac', '#26a69a', '#009688', '#00897b', '#00796b', '#00695c', '#004d40', '#a7ffeb', '#64ffda', '#1de9b6', '#00bfa5'] },

  { name: 'green', colors: ['#e8f5e9', '#c8e6c9', '#a5d6a7', '#81c784', '#66bb6a', '#4caf50', '#43a047', '#388e3c', '#2e7d32', '#1b5e20', '#b9f6ca', '#69f0ae', '#00e676', '#00c853'] },

  { name: 'lightGreen', colors: ['#f1f8e9', '#dcedc8', '#c5e1a5', '#aed581', '#9ccc65', '#8bc34a', '#7cb342', '#689f38', '#558b2f', '#33691e', '#ccff90', '#b2ff59', '#76ff03', '#64dd17'] },

  { name: 'lime', colors: ['#f9fbe7', '#f0f4c3', '#e6ee9c', '#dce775', '#d4e157', '#cddc39', '#c0ca33', '#afb42b', '#9e9d24', '#827717', '#f4ff81', '#eeff41', '#c6ff00', '#aeea00'] },

  { name: 'yellow', colors: ['#fffde7', '#fff9c4', '#fff59d', '#fff176', '#ffee58', '#ffeb3b', '#fdd835', '#fbc02d', '#f9a825', '#f57f17', '#ffff8d', '#ffff00', '#ffea00', '#ffd600'] },

  { name: 'amber', colors: ['#fff8e1', '#ffecb3', '#ffe082', '#ffd54f', '#ffca28', '#ffc107', '#ffb300', '#ffa000', '#ff8f00', '#ff6f00', '#ffe57f', '#ffd740', '#ffc400', '#ffab00'] },

  { name: 'orange', colors: ['#fff3e0', '#ffe0b2', '#ffcc80', '#ffb74d', '#ffa726', '#ff9800', '#fb8c00', '#f57c00', '#ef6c00', '#e65100', '#ffd180', '#ffab40', '#ff9100', '#ff6d00'] },

  { name: 'deepOrange', colors: ['#fbe9e7', '#ffccbc', '#ffab91', '#ff8a65', '#ff7043', '#ff5722', '#f4511e', '#e64a19', '#d84315', '#bf360c', '#ff9e80', '#ff6e40', '#ff3d00', '#dd2c00'] }

];



// 2. Bottom Section Rows (Left Side)

const PALETTE_BOTTOM = [

  { name: 'grey', colors: ['#fafafa', '#f5f5f5', '#eeeeee', '#e0e0e0', '#bdbdbd', '#9e9e9e', '#757575', '#616161', '#424242', '#212121'] },

  { name: 'blueGrey', colors: ['#eceff1', '#cfd8dc', '#b0bec5', '#90a4ae', '#78909c', '#607d8b', '#546e7a', '#455a64', '#37474f', '#263238'] },

  { name: 'brown', colors: ['#efebe9', '#d7ccc8', '#bcaaa4', '#a1887f', '#8d6e63', '#795548', '#6d4c41', '#5d4037', '#4e342e', '#3e2723'] }

];



let materialPickerCallback = null;

let materialPreviewCallback = null; // Hover preview

let materialRevertCallback = null;  // Revert on leave/cancel



function setupMaterialColorPicker() {

  const modal = document.getElementById('material-picker-modal');

  const grid = document.getElementById('material-color-grid');

  const closeBtn = document.getElementById('material-picker-close');

  

  // Triggers

  const fallbackTriggerBtn = document.getElementById('app-bookmark-fallback-color-trigger');

  const folderTriggerBtn = document.getElementById('app-bookmark-folder-color-trigger');

  const textBgTriggerBtn = document.getElementById('app-bookmark-text-bg-color-trigger');



  if (!modal || !grid) return;



  // --- 1. Optimization: Build HTML first, attach 1 listener later ---

  grid.innerHTML = '';



  // Helper to create a row (No event listeners here anymore)

  function createRow(group) {

    const row = document.createElement('div');

    row.className = 'material-color-row';



    const label = document.createElement('div');

    label.className = 'material-color-label';

    label.textContent = group.name;



    const baseColor = group.colors[Math.min(5, group.colors.length - 1)];

    label.style.backgroundColor = baseColor;

    label.style.color = '#ffffff';

    label.title = `Select ${group.name} (${baseColor})`;

    

    // Store data for delegation

    label.dataset.color = baseColor;

    label.dataset.isClickable = 'true'; 

    

    row.appendChild(label);



    group.colors.forEach(color => {

      const swatch = document.createElement('div');

      swatch.className = 'material-color-swatch';

      swatch.style.backgroundColor = color;

      

      // Store data for delegation

      swatch.dataset.color = color.toLowerCase();

      swatch.dataset.isClickable = 'true';

      

      row.appendChild(swatch);

    });

    return row;

  }



  function pickColor(color) {

    // A confirmed pick means hover/revert callbacks are no longer needed

    materialPreviewCallback = null;

    materialRevertCallback = null;



    if (materialPickerCallback) materialPickerCallback(color);

    closeMaterialPicker();

  }



  // --- 2. Optimization: Efficient Highlighting ---

  function highlightSelectedColor(hexColor) {

    if (!hexColor) return;

    const target = hexColor.toLowerCase();



    // A. Efficiently remove old selection (don't loop through everything)

    const oldSelected = grid.querySelector('.selected');

    if (oldSelected) {

      oldSelected.classList.remove('selected');

    }



    // B. Find new target

    const match = grid.querySelector(`[data-color="${target}"]`);

    if (match) {

      match.classList.add('selected');

    }

  }



  // Helper to open picker relative to a button

  function openPickerFor(button, onPick, onPreview, onRevert) {

    materialPickerCallback = onPick;

    materialPreviewCallback = onPreview;

    materialRevertCallback = onRevert;

    modal.classList.remove('hidden');



    // Calculate animation origin relative to trigger button

    const triggerRect = button.getBoundingClientRect();

    const gridLeft = grid.offsetLeft;

    const gridTop = grid.offsetTop;



    const originX = (triggerRect.left + triggerRect.width / 2) - gridLeft;

    const originY = (triggerRect.top + triggerRect.height / 2) - gridTop;



    grid.style.transformOrigin = `${originX}px ${originY}px`;



    // Highlight the current color selection

    const currentColor = button.dataset.value;

    highlightSelectedColor(currentColor);

  }



  // A. Render Standard Rows

  PALETTE_TOP.forEach(group => {

    grid.appendChild(createRow(group));

  });



  // B. Render Footer Section (Split: Rows on Left, B/W on Right)

  const footer = document.createElement('div');

  footer.className = 'material-picker-footer';



  // Left Column (Grey, BlueGrey, Brown)

  const footerRows = document.createElement('div');

  footerRows.className = 'material-footer-rows';

  PALETTE_BOTTOM.forEach(group => {

    footerRows.appendChild(createRow(group));

  });

  footer.appendChild(footerRows);



  // Right Column (White, Black)

  const footerBW = document.createElement('div');

  footerBW.className = 'material-footer-bw';



  const whiteBox = document.createElement('div');

  whiteBox.className = 'bw-swatch';

  whiteBox.style.backgroundColor = '#ffffff';

  whiteBox.style.color = '#000000';

  whiteBox.textContent = 'white';

  whiteBox.dataset.color = '#ffffff';

  whiteBox.dataset.isClickable = 'true';

  footerBW.appendChild(whiteBox);



  const blackBox = document.createElement('div');

  blackBox.className = 'bw-swatch';

  blackBox.style.backgroundColor = '#000000';

  blackBox.style.color = '#ffffff';

  blackBox.textContent = 'black';

  blackBox.dataset.color = '#000000';

  blackBox.dataset.isClickable = 'true';

  footerBW.appendChild(blackBox);



  footer.appendChild(footerBW);

  grid.appendChild(footer);



  // --- 3. Optimization: Single Event Listener (Delegation) ---

  grid.addEventListener('click', (e) => {

    // Check if the clicked element has our specific data attribute

    // We check dataset.isClickable or class names

    const target = e.target.closest('[data-is-clickable="true"]');

    

    if (target && target.dataset.color) {

      pickColor(target.dataset.color);

    }

  });



  // --- Hover Preview ---

  grid.addEventListener('mouseover', (e) => {

    const target = e.target.closest('[data-is-clickable="true"]');

    if (target && target.dataset.color && materialPreviewCallback) {

      materialPreviewCallback(target.dataset.color);

    }

  });



  // --- Leave Revert ---

  grid.addEventListener('mouseleave', () => {

    if (materialRevertCallback) {

      materialRevertCallback();

    }

  });



  // --- Attach Trigger Listeners ---



  // 1. Fallback Icon Color Trigger

  if (fallbackTriggerBtn) {

    updateColorTrigger(fallbackTriggerBtn, appBookmarkFallbackColorPreference);

    fallbackTriggerBtn.dataset.value = appBookmarkFallbackColorPreference;



    fallbackTriggerBtn.addEventListener('click', () => {

      const originalColor = appBookmarkFallbackColorPreference;



      openPickerFor(

        fallbackTriggerBtn,

        (newColor) => {

          updateColorTrigger(fallbackTriggerBtn, newColor);

          fallbackTriggerBtn.dataset.value = newColor;

          appBookmarkFallbackColorPreference = newColor;

          applyBookmarkFallbackColor(newColor);

        },

        (previewColor) => {

          applyBookmarkFallbackColor(previewColor);

          updateColorTrigger(fallbackTriggerBtn, previewColor);

        },

        () => {

          applyBookmarkFallbackColor(originalColor);

          updateColorTrigger(fallbackTriggerBtn, originalColor);

        }

      );

    });

  }



  // 2. Folder Icon Color Trigger

  if (folderTriggerBtn) {

    updateColorTrigger(folderTriggerBtn, appBookmarkFolderColorPreference);

    folderTriggerBtn.dataset.value = appBookmarkFolderColorPreference;



    folderTriggerBtn.addEventListener('click', () => {

      const originalColor = appBookmarkFolderColorPreference;



      openPickerFor(

        folderTriggerBtn,

        (newColor) => {

          updateColorTrigger(folderTriggerBtn, newColor);

          folderTriggerBtn.dataset.value = newColor;

          appBookmarkFolderColorPreference = newColor;

          applyBookmarkFolderColor(newColor);



          // Re-render current grid so folder icons update immediately

          if (currentGridFolderNode && bookmarkTree && bookmarkTree[0]) {

            const freshNode = findBookmarkNodeById(bookmarkTree[0], currentGridFolderNode.id) || currentGridFolderNode;

            if (freshNode) {

              renderBookmarkGrid(freshNode);

            }

          }

        },

        (previewColor) => {

          applyBookmarkFolderColor(previewColor);

          updateColorTrigger(folderTriggerBtn, previewColor);

        },

        () => {

          applyBookmarkFolderColor(originalColor);

          updateColorTrigger(folderTriggerBtn, originalColor);

        }

      );

    });

  }



  // 3. Bookmark Text Background Color Trigger

  if (textBgTriggerBtn) {

    updateColorTrigger(textBgTriggerBtn, appBookmarkTextBgColorPreference);

    textBgTriggerBtn.dataset.value = appBookmarkTextBgColorPreference;



    textBgTriggerBtn.addEventListener('click', () => {

      const originalColor = appBookmarkTextBgColorPreference;



      openPickerFor(

        textBgTriggerBtn,

        (newColor) => {

          updateColorTrigger(textBgTriggerBtn, newColor);

          textBgTriggerBtn.dataset.value = newColor;

          appBookmarkTextBgColorPreference = newColor;

          applyBookmarkTextBgColor(newColor);

        },

        (previewColor) => {

          applyBookmarkTextBgColor(previewColor);

          updateColorTrigger(textBgTriggerBtn, previewColor);

        },

        () => {

          applyBookmarkTextBgColor(originalColor);

          updateColorTrigger(textBgTriggerBtn, originalColor);

        }

      );

    });

  }



  if (closeBtn) closeBtn.addEventListener('click', closeMaterialPicker);

  modal.addEventListener('click', (e) => {

    if (e.target === modal) closeMaterialPicker();

  });

}



function closeMaterialPicker() {

  const modal = document.getElementById('material-picker-modal');

  if (!modal) return;



  // If we have a revert callback (meaning no final pick yet), revert on close

  if (materialRevertCallback) {

    materialRevertCallback();

  }

  materialRevertCallback = null;

  materialPreviewCallback = null;



  modal.classList.add('closing');



  setTimeout(() => {

    modal.classList.add('hidden');

    modal.classList.remove('closing');

    if (document.querySelectorAll('.modal-overlay:not(.hidden)').length === 0) {

      document.body.classList.remove('modal-open');

    }

    

    // --- RESET POSITIONING STYLES ---

    // This ensures the picker returns to center mode for other uses (like Settings)

    modal.style.display = ''; // Reverts to CSS (flex)

    

    const dialog = modal.querySelector('.material-picker-dialog');

    if (dialog) {

      dialog.style.position = '';

      dialog.style.top = '';

      dialog.style.left = '';

      dialog.style.margin = '';

    }

    

    const grid = document.getElementById('material-color-grid');

    if (grid) {

      grid.style.transformOrigin = '';

    }

  }, 150);

}
