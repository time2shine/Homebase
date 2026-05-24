// ===============================================
// --- CINEMA MODE LOGIC ---
// ===============================================
let cinemaTimeout;
let cinemaMoveListener;
let cinemaKeyListener;
let cinemaClickListener;
let cinemaListenersAttached = false;

function resetCinemaMode() {
  document.body.classList.remove('cinema-mode');
  if (cinemaTimeout) clearTimeout(cinemaTimeout);

  if (isPerformanceModeEnabled()) return;
  if (!appCinemaModePreference) return;

  cinemaTimeout = setTimeout(() => {
    if (isPerformanceModeEnabled()) return;
    if (!appCinemaModePreference) return;
    if (document.body.classList.contains('modal-open')) return;

    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return;

    document.body.classList.add('cinema-mode');
  }, 8000);
}

function detachCinemaModeListeners() {
  if (cinemaMoveListener) {
    window.removeEventListener('mousemove', cinemaMoveListener);
    cinemaMoveListener = null;
  }
  if (cinemaKeyListener) {
    window.removeEventListener('keydown', cinemaKeyListener);
    cinemaKeyListener = null;
  }
  if (cinemaClickListener) {
    window.removeEventListener('click', cinemaClickListener);
    cinemaClickListener = null;
  }
  cinemaListenersAttached = false;
}

function disableCinemaModeRuntime() {
  document.body.classList.remove('cinema-mode');
  if (cinemaTimeout) clearTimeout(cinemaTimeout);
  detachCinemaModeListeners();
}

function setupCinemaModeListeners() {
  if (isPerformanceModeEnabled() || !appCinemaModePreference) {
    detachCinemaModeListeners();
    resetCinemaMode();
    return;
  }

  if (cinemaListenersAttached) return;

  const throttledReset = throttle(resetCinemaMode, 200);
  cinemaMoveListener = throttledReset;
  cinemaKeyListener = resetCinemaMode;
  cinemaClickListener = resetCinemaMode;

  window.addEventListener('mousemove', cinemaMoveListener);
  window.addEventListener('keydown', cinemaKeyListener);
  window.addEventListener('click', cinemaClickListener);
  cinemaListenersAttached = true;
  resetCinemaMode();
}
