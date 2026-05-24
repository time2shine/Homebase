function applyBookmarkTextBg(enabled) {

  appBookmarkTextBgPreference = enabled;

  document.body.classList.toggle('bookmark-text-bg-enabled', enabled);

}



function hexToRgbString(hex) {

  const clean = (hex || '').replace(/^#/, '');

  const bigint = parseInt(clean, 16);

  if (Number.isNaN(bigint)) return '44, 165, 255'; // fallback to default blue

  const r = (bigint >> 16) & 255;

  const g = (bigint >> 8) & 255;

  const b = bigint & 255;

  return `${r}, ${g}, ${b}`;

}



function applyBookmarkTextBgOpacity(opacity) {

  const safeOpacity = Math.max(0, Math.min(1, parseFloat(opacity)));

  const resolvedOpacity = Number.isFinite(safeOpacity) ? safeOpacity : 0.65;

  appBookmarkTextBgOpacityPreference = resolvedOpacity;

  document.documentElement.style.setProperty('--bookmark-text-bg-opacity', resolvedOpacity);



  // Update the label text in settings

  const label = document.getElementById('app-bookmark-text-opacity-value');

  const slider = document.getElementById('app-bookmark-text-opacity-slider');

  if (label) label.textContent = `${Math.round(resolvedOpacity * 100)}%`;

  if (slider && slider.value !== String(resolvedOpacity)) {

    slider.value = resolvedOpacity;

  }



  // Re-evaluate contrast since opacity influences perceived brightness

  applyBookmarkTextBgColor(appBookmarkTextBgColorPreference);

}



function applyBookmarkTextBgBlur(blurRadius) {

  const parsed = parseInt(blurRadius, 10);

  const safeBlur = Number.isFinite(parsed) ? Math.max(0, parsed) : 4;

  appBookmarkTextBgBlurPreference = safeBlur;

  document.documentElement.style.setProperty('--bookmark-text-bg-blur', `${safeBlur}px`);



  const label = document.getElementById('app-bookmark-text-blur-value');

  const slider = document.getElementById('app-bookmark-text-blur-slider');

  if (label) label.textContent = `${safeBlur}px`;

  if (slider && slider.value !== String(safeBlur)) {

    slider.value = safeBlur;

  }

}



function applyBookmarkTextBgColor(color) {

  if (!color) return;

  appBookmarkTextBgColorPreference = color;

  const rgbValues = hexToRgbString(color);

  document.documentElement.style.setProperty('--bookmark-text-bg-rgb', rgbValues);

  if (isLightColor(color, appBookmarkTextBgOpacityPreference)) {

    document.documentElement.style.setProperty('--bookmark-text-color', '#000000');

    document.documentElement.style.setProperty('--bookmark-text-shadow', 'none');

  } else {

    document.documentElement.style.setProperty('--bookmark-text-color', '#ffffff');

    document.documentElement.style.setProperty('--bookmark-text-shadow', '0 1px 2px rgba(0,0,0,0.3)');

  }

}



function applyBookmarkFallbackColor(color) {

  if (!color) return;

  document.documentElement.style.setProperty('--bookmark-fallback-color', color);

  if (isLightColor(color)) {

    document.documentElement.style.setProperty('--bookmark-fallback-text-color', '#000000');

  } else {

    document.documentElement.style.setProperty('--bookmark-fallback-text-color', '#FFFFFF');

  }

}



function applyBookmarkFolderColor(color) {

  if (!color) return;

  document.documentElement.style.setProperty('--bookmark-folder-color', color);

}
