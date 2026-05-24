function extractAverageColor(imgUrl) {

  return new Promise((resolve) => {

    const img = new Image();

    img.crossOrigin = 'anonymous';

    img.src = imgUrl;



    img.onload = () => {

      const canvas = document.createElement('canvas');

      canvas.width = img.width;

      canvas.height = img.height;

      const ctx = canvas.getContext('2d');



      ctx.drawImage(img, 0, 0);

      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;



      let r = 0; let g = 0; let b = 0;

      let count = 0;



      for (let i = 0; i < data.length; i += 200) {

        r += data[i];

        g += data[i + 1];

        b += data[i + 2];

        count++;

      }



      resolve(`rgb(${Math.round(r / count)}, ${Math.round(g / count)}, ${Math.round(b / count)})`);

    };



    img.onerror = () => resolve('#2ca5ff');

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
