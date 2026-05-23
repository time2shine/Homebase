function initUnifiedSortable(containerEl, onEnd, overrides = {}, sortablePerfKey = 'searchEngines') {
  const sortableStart = getPerfMeasureStart();
  const isAvailable = recordSortableLibraryAvailability();

  if (!containerEl || !isAvailable) {
    recordSortablePerfTiming(sortablePerfKey, sortableStart, 'skipped');
    return null;
  }

  const options = Object.assign({
    animation: 150,
    handle: '.engine-toggle-main',
    ghostClass: 'sortable-ghost-engine'
  }, overrides || {});

  if (typeof onEnd === 'function') {
    options.onEnd = onEnd;
  }

  try {
    const sortableInstance = Sortable.create(containerEl, options);
    recordSortablePerfTiming(sortablePerfKey, sortableStart, 'done');
    return sortableInstance;
  } catch (err) {
    recordSortablePerfTiming(sortablePerfKey, sortableStart, 'failed');
    throw err;
  }
}
