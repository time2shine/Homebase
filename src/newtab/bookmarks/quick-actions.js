function setupQuickActions() {
  const quickAddBookmarkBtn = (typeof document !== 'undefined') ? document.getElementById('quick-add-bookmark') : null;
  const quickAddFolderBtn = (typeof document !== 'undefined') ? document.getElementById('quick-add-folder') : null;
  const quickOpenBookmarksBtn = (typeof document !== 'undefined') ? document.getElementById('quick-open-bookmarks') : null;

  if (quickAddBookmarkBtn) {
    quickAddBookmarkBtn.addEventListener('click', showAddBookmarkModal);
  }

  if (quickAddFolderBtn) {
    quickAddFolderBtn.addEventListener('click', showAddFolderModal);
  }

  const blankMenu = (typeof gridBlankMenu !== 'undefined' && gridBlankMenu)
    || (typeof document !== 'undefined' ? document.getElementById('bookmark-grid-blank-menu') : null);

  if (quickOpenBookmarksBtn && blankMenu) {
    const moreBtn = quickOpenBookmarksBtn;

    const closeMenuOutside = (e) => {
      if (!moreBtn.contains(e.target) && !blankMenu.contains(e.target)) {
        blankMenu.classList.add('hidden');
        document.removeEventListener('click', closeMenuOutside);
      }
    };

    // Click handler with tooltip hide + menu toggle
    moreBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      const tooltip = moreBtn.querySelector('.tooltip-popup');
      if (tooltip) {
        tooltip.style.visibility = 'hidden';
        tooltip.style.opacity = '0';
      }

      document.querySelectorAll('.context-menu').forEach((el) => {
        if (el !== blankMenu) el.classList.add('hidden');
      });

      const isHidden = blankMenu.classList.contains('hidden');
      if (isHidden) {
        const rect = moreBtn.getBoundingClientRect();
        blankMenu.style.position = 'fixed';
        blankMenu.style.left = `${rect.left}px`;
        blankMenu.style.top = `${rect.bottom + 8}px`;
        blankMenu.classList.remove('hidden');
        document.addEventListener('click', closeMenuOutside);
      } else {
        blankMenu.classList.add('hidden');
        document.removeEventListener('click', closeMenuOutside);
      }
    });

    // Restore tooltip on mouse leave
    moreBtn.addEventListener('mouseleave', () => {
      const tooltip = moreBtn.querySelector('.tooltip-popup');
      if (tooltip) {
        tooltip.style.visibility = '';
        tooltip.style.opacity = '';
      }
    });
  }
}

if (typeof window !== 'undefined') {
  window.setupQuickActions = setupQuickActions;
}
