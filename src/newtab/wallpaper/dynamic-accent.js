function extractAverageColor(imgUrl) {
  return new Promise((resolve) => {
    if (!imgUrl || typeof imgUrl !== 'string') {
      resolve('#2ca5ff');
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';

    let settled = false;
    const safeResolve = (color) => {
      if (settled) return;
      settled = true;
      img.onload = null;
      img.onerror = null;
      resolve(color);
    };

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          safeResolve('#2ca5ff');
          return;
        }

        ctx.drawImage(img, 0, 0, 1, 1);
        const pixel = ctx.getImageData(0, 0, 1, 1).data;

        // Defensive cleanup: reset canvas dimensions immediately to release backing buffer
        canvas.width = 0;
        canvas.height = 0;

        if (!pixel || pixel.length < 3) {
          safeResolve('#2ca5ff');
          return;
        }

        safeResolve(`rgb(${pixel[0]}, ${pixel[1]}, ${pixel[2]})`);
      } catch (err) {
        safeResolve('#2ca5ff');
      }
    };

    img.onerror = () => safeResolve('#2ca5ff');
    img.src = imgUrl;
  });
}




async function updateDynamicAccent() {

  if (isPerformanceModeEnabled()) {
    recordStartupPerfEventOnce('newtab:dynamic-accent-skipped-performance-mode');
    return;
  }

  if (!document || !document.body || !document.documentElement) return;

  try {
    const bg = document.body.style?.backgroundImage;
    if (!bg || bg === 'none') return;

    const poster = bg.replace(/^url\("|"\)$/g, '');
    if (!poster) return;

    const avg = await extractAverageColor(poster);
    document.documentElement.style.setProperty('--dynamic-accent', avg);
  } catch (err) {
    console.warn('Dynamic accent update failed', err);
  }

}

if (typeof window !== 'undefined') {
  window.extractAverageColor = extractAverageColor;
  window.updateDynamicAccent = updateDynamicAccent;
}
