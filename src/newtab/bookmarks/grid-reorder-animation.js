function captureGridItemPositions(grid) {

  if (!grid) return null;

  const positions = {};

  grid.querySelectorAll('.bookmark-item').forEach(item => {

    const bookmarkId = item.dataset.bookmarkId;

    if (!bookmarkId) return;

    positions[bookmarkId] = item.getBoundingClientRect();

  });

  return positions;

}



function animateGridReorder(items, previousPositions) {

  if (!previousPositions) {

    items.forEach(item => {

      item.style.opacity = 1;

    });

    return;

  }



  const animations = [];



  items.forEach(item => {

    if (item.classList.contains('back-button')) {

      item.style.opacity = 1;

      return;

    }

    const bookmarkId = item.dataset.bookmarkId;

    if (!bookmarkId) {

      item.style.opacity = 1;

      return;

    }

    const previousRect = previousPositions[bookmarkId];

    if (!previousRect) {

      item.style.opacity = 1;

      return;

    }



    const newRect = item.getBoundingClientRect();

    const deltaX = previousRect.left - newRect.left;

    const deltaY = previousRect.top - newRect.top;



    if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) {

      item.style.opacity = 1;

      return;

    }



    animations.push({ item, deltaX, deltaY });

  });



  if (!animations.length) {

    items.forEach(item => {

      item.style.opacity = 1;

    });

    return;

  }



  requestAnimationFrame(() => {

    animations.forEach(({ item, deltaX, deltaY }) => {

      item.style.transition = 'none';

      item.style.transform = `translate(${deltaX}px, ${deltaY}px)`;

      item.style.opacity = 1;

      item.style.willChange = 'transform';

    });



    requestAnimationFrame(() => {

      animations.forEach(({ item }) => {

        item.style.transition = 'transform 250ms ease';

        item.style.transform = '';

        const cleanup = () => {

          item.style.transition = '';

          item.style.willChange = '';

          item.removeEventListener('transitionend', cleanup);

        };

        item.addEventListener('transitionend', cleanup);

      });

    });

  });

}
