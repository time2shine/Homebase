import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const wallpaperControllerCode = fs.readFileSync(path.join(rootDir, 'src/newtab/wallpaper/wallpaper-controller.js'), 'utf8');

function createMockClassList() {
  const classes = new Set();
  return {
    add: (...names) => names.forEach((n) => classes.add(n)),
    remove: (...names) => names.forEach((n) => classes.delete(n)),
    toggle: (name, force) => {
      if (force === undefined) {
        if (classes.has(name)) classes.delete(name);
        else classes.add(name);
      } else if (force) {
        classes.add(name);
      } else {
        classes.delete(name);
      }
      return classes.has(name);
    },
    contains: (name) => classes.has(name)
  };
}

function createMockVideoElement(index = 0, timerFn = (cb) => setTimeout(cb, 0)) {
  const listeners = new Map();
  const dataset = {};
  let isPlaying = false;
  let isPaused = true;
  let isEnded = false;
  let duration = 15;
  let currentTime = 0;
  let readyState = 4;
  let playCalls = 0;
  let pauseCalls = 0;
  let loadCalls = 0;

  const classList = createMockClassList();
  classList.add('background-video');

  const sourceEl = {
    src: '',
    tagName: 'SOURCE'
  };

  const video = {
    dataset,
    classList,
    poster: '',
    src: '',
    muted: false,
    playsInline: false,
    loop: false,
    preload: 'none',
    offsetWidth: 1920,
    duration,
    get ended() { return isEnded; },
    set ended(v) { isEnded = Boolean(v); },
    get readyState() { return readyState; },
    set readyState(v) { readyState = v; },
    get currentTime() { return currentTime; },
    set currentTime(v) { currentTime = v; },
    get paused() { return isPaused; },
    get playCalls() { return playCalls; },
    get pauseCalls() { return pauseCalls; },
    get loadCalls() { return loadCalls; },
    play: async () => {
      playCalls++;
      isPaused = false;
      isPlaying = true;
      isEnded = false;
      return Promise.resolve();
    },
    pause: () => {
      pauseCalls++;
      isPaused = true;
      isPlaying = false;
    },
    load: () => {
      loadCalls++;
    },
    requestVideoFrameCallback: (cb) => {
      timerFn(() => cb(0, {}));
    },
    addEventListener: (type, handler, opts) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(handler);
    },
    removeEventListener: (type, handler) => {
      if (listeners.has(type)) {
        listeners.get(type).delete(handler);
      }
    },
    querySelector: (sel) => (sel === 'source' ? sourceEl : null),
    removeAttribute: (attr) => {
      if (attr === 'src') video.src = '';
      if (attr === 'poster') video.poster = '';
    },
    trigger(type, eventObj = {}) {
      if (listeners.has(type)) {
        listeners.get(type).forEach((h) => {
          try { h(eventObj); } catch (_) {}
        });
      }
    }
  };
  return video;
}

function createWallpaperVisibilityEnvironment(options = {}) {
  const {
    initialHidden = false,
    initialPerfMode = false,
    initialBatteryDischarging = false,
    initialBatteryPref = false,
    initialType = 'video',
    initialSelection = { id: 'wp-waves', videoUrl: 'waves.mp4', posterUrl: 'waves.webp' },
    useControlledTimers = false
  } = options;

  let documentHidden = initialHidden;
  let perfMode = initialPerfMode;
  let batteryDischarging = initialBatteryDischarging;
  let batteryPref = initialBatteryPref;
  let searchFocused = false;

  const controlledTimers = new Map();
  let timerIdSeq = 0;
  let virtualTime = 0;

  const envSetTimeout = (fn, ms = 0) => {
    if (!useControlledTimers) return setTimeout(fn, ms);
    const id = ++timerIdSeq;
    controlledTimers.set(id, { fn, triggerAt: virtualTime + Math.max(0, ms) });
    return id;
  };

  const envClearTimeout = (id) => {
    if (!useControlledTimers) return clearTimeout(id);
    controlledTimers.delete(id);
  };

  const envRAF = (fn) => {
    return envSetTimeout(fn, 0);
  };

  const docListeners = new Map();
  const searchInput = {
    id: 'search-input',
    focus: () => { searchFocused = true; }
  };
  const bodyClasses = createMockClassList();

  const videos = [createMockVideoElement(0, envRAF), createMockVideoElement(1, envRAF)];

  const doc = {
    body: {
      classList: bodyClasses
    },
    documentElement: {
      dataset: {},
      style: {
        setProperty: () => {},
        removeProperty: () => {},
        getPropertyValue: () => ''
      }
    },
    get hidden() { return documentHidden; },
    set hidden(val) { documentHidden = Boolean(val); },
    get visibilityState() { return documentHidden ? 'hidden' : 'visible'; },
    addEventListener: (type, handler) => {
      if (!docListeners.has(type)) docListeners.set(type, new Set());
      docListeners.get(type).add(handler);
    },
    removeEventListener: (type, handler) => {
      if (docListeners.has(type)) docListeners.get(type).delete(handler);
    },
    querySelectorAll: (sel) => {
      if (sel === '.background-video') return videos;
      return [];
    },
    querySelector: (sel) => {
      if (sel === '.background-video.is-active') {
        return videos.find((v) => v.classList.contains('is-active')) || null;
      }
      return null;
    },
    getElementById: (id) => {
      if (id === 'search-input') return searchInput;
      return null;
    },
    trigger(type) {
      if (docListeners.has(type)) {
        docListeners.get(type).forEach((fn) => {
          try { fn(); } catch (_) {}
        });
      }
    }
  };

  const sandbox = {
    window: null,
    document: doc,
    navigator: {
      getBattery: async () => ({
        charging: !batteryDischarging
      })
    },
    console,
    setTimeout: envSetTimeout,
    clearTimeout: envClearTimeout,
    requestAnimationFrame: envRAF,
    cancelAnimationFrame: envClearTimeout,
    Image: class {
      constructor() {
        envSetTimeout(() => {
          if (typeof this.onload === 'function') this.onload();
        }, 0);
      }
    },
    AbortController: globalThis.AbortController,
    isPerformanceModeEnabled: () => perfMode,
    get appBatteryOptimizationPreference() { return batteryPref; },
    set appBatteryOptimizationPreference(v) { batteryPref = Boolean(v); },
    applyWallpaperBackground: () => {},
    setWallpaperFallbackPoster: () => {},
    getVideosManifest: async () => [],
    getCacheKeyVariants: (k) => (k ? [k] : []),
    isRemoteHttpUrl: () => false,
    getWallpaperRotationState: async () => ({}),
    setCachedAppliedPosterUrl: () => {},
    setWallpaperSelectionWithFallback: () => {},
    syncWallpaperStartupState: () => {},
    wallpaperObjectUrlCache: new Map()
  };
  sandbox.window = sandbox;

  const context = vm.createContext(sandbox);
  vm.runInContext(wallpaperControllerCode, context);

  // Set initial state
  context.HomebaseWallpaperController.setWallpaperTypePreferenceState(initialType);
  context.applyWallpaperByType(initialSelection, initialType);

  return {
    context,
    doc,
    videos,
    searchInput,
    setDocumentHidden(val) {
      doc.hidden = val;
      doc.trigger('visibilitychange');
    },
    setPerformanceMode(val) {
      perfMode = Boolean(val);
    },
    setBatteryDischarging(val) {
      batteryDischarging = Boolean(val);
    },
    setBatteryPref(val) {
      batteryPref = Boolean(val);
    },
    isSearchFocused: () => searchFocused,
    resetSearchFocused: () => { searchFocused = false; },
    advanceTimers(ms = 0) {
      if (!useControlledTimers) return;
      virtualTime += ms;
      let executed = true;
      while (executed) {
        executed = false;
        let earliest = null;
        let earliestId = null;
        for (const [id, entry] of controlledTimers.entries()) {
          if (entry.triggerAt <= virtualTime) {
            if (!earliest || entry.triggerAt < earliest.triggerAt) {
              earliest = entry;
              earliestId = id;
            }
          }
        }
        if (earliest && earliestId) {
          controlledTimers.delete(earliestId);
          earliest.fn();
          executed = true;
        }
      }
    },
    getPendingTimerCount: () => (useControlledTimers ? controlledTimers.size : 0),
    flushMicrotasks: async () => {
      for (let i = 0; i < 5; i++) {
        await Promise.resolve();
      }
    },
    settleInitialPlayback: async () => {
      for (let i = 0; i < 25; i++) {
        for (let m = 0; m < 5; m++) await Promise.resolve();
        if (useControlledTimers) {
          virtualTime += 10;
          let executed = true;
          while (executed) {
            executed = false;
            let earliest = null;
            let earliestId = null;
            for (const [id, entry] of controlledTimers.entries()) {
              if (entry.triggerAt <= virtualTime) {
                if (!earliest || entry.triggerAt < earliest.triggerAt) {
                  earliest = entry;
                  earliestId = id;
                }
              }
            }
            if (earliest && earliestId) {
              controlledTimers.delete(earliestId);
              earliest.fn();
              executed = true;
            }
          }
        }
        for (let m = 0; m < 5; m++) await Promise.resolve();
        if (videos[0].classList.contains('is-active')) {
          break;
        }
      }
    },
    envSetTimeout
  };
}

// =============================================================================
// TEST SUITE: Wallpaper Playback Across Visibility Transitions
// =============================================================================

test('1. Static wallpaper remains static across hidden/visible transitions', async () => {
  const env = createWallpaperVisibilityEnvironment({
    initialType: 'static',
    initialSelection: { id: 'wp-mountains', posterUrl: 'mountains.webp', videoUrl: '' }
  });

  const { doc, videos } = env;
  const initialPlayCalls0 = videos[0].playCalls;
  const initialPlayCalls1 = videos[1].playCalls;

  // Transition: Visible -> Hidden
  env.setDocumentHidden(true);
  assert.equal(doc.hidden, true);

  // Transition: Hidden -> Visible
  env.setDocumentHidden(false);
  await new Promise((r) => setTimeout(r, 20));

  // Assert: Static wallpaper MUST remain static; no video play calls allowed
  assert.equal(videos[0].playCalls, initialPlayCalls0, 'videos[0] must not be played on static wallpaper');
  assert.equal(videos[1].playCalls, initialPlayCalls1, 'videos[1] must not be played on static wallpaper');
  assert.equal(videos[0].classList.contains('is-active'), false, 'video must not be marked active for static wallpaper');
});

test('2. Live wallpaper pauses when tab is hidden and resumes when visible', async () => {
  const env = createWallpaperVisibilityEnvironment({
    initialType: 'video',
    initialSelection: { id: 'wp-ocean', videoUrl: 'ocean.mp4', posterUrl: 'ocean.webp' }
  });

  const { videos } = env;
  // Let initial playback and crossfade settle
  await new Promise((r) => setTimeout(r, 30));

  const activeVideo = videos.find((v) => v.classList.contains('is-active'));
  assert.ok(activeVideo, 'An active video should exist after initial setup');
  assert.equal(activeVideo.paused, false, 'Active video should be playing');
  const initialPlayCalls = activeVideo.playCalls;

  // Transition: Visible -> Hidden
  env.setDocumentHidden(true);
  assert.equal(activeVideo.paused, true, 'Active video must be paused when document is hidden');
  assert.equal(activeVideo.dataset.wasPlaying, 'true', 'Active video must be flagged wasPlaying');

  // Transition: Hidden -> Visible
  env.setDocumentHidden(false);
  await new Promise((r) => setTimeout(r, 20));

  assert.equal(activeVideo.paused, false, 'Active video must resume playback on visible');
  assert.equal(activeVideo.playCalls, initialPlayCalls + 1, 'play() should be called once on resume');
  assert.equal(activeVideo.dataset.wasPlaying, undefined, 'wasPlaying flag should be cleaned up after resume');
});

test('3. Live wallpaper finishes loading while hidden: no playback while hidden, resumes on visible', async () => {
  // Start with tab hidden
  const env = createWallpaperVisibilityEnvironment({
    initialHidden: true,
    initialType: 'video',
    initialSelection: { id: 'wp-forest', videoUrl: 'forest.mp4', posterUrl: 'forest.webp' }
  });

  const { videos } = env;
  // Wait for asynchronous source load promise to resolve while hidden
  await new Promise((r) => setTimeout(r, 40));

  // Assert: NO video should be playing while hidden
  videos.forEach((v, idx) => {
    assert.equal(v.paused, true, `Video ${idx} must remain paused while document is hidden`);
    assert.equal(v.playCalls, 0, `Video ${idx} must not have called play() while hidden`);
  });

  // Now return to the tab: Hidden -> Visible
  env.setDocumentHidden(false);
  await new Promise((r) => setTimeout(r, 40));

  const activeVideo = videos.find((v) => v.classList.contains('is-active'));
  assert.ok(activeVideo, 'Live wallpaper should set up active video on returning to tab');
  assert.equal(activeVideo.paused, false, 'Live wallpaper must start playback when tab becomes visible');
  assert.ok(activeVideo.playCalls >= 1, 'Active video must have called play() after becoming visible');
});

test('4. Performance Mode ON strictly prevents video playback across transitions', async () => {
  const env = createWallpaperVisibilityEnvironment({
    initialPerfMode: true,
    initialType: 'video',
    initialSelection: { id: 'wp-aurora', videoUrl: 'aurora.mp4', posterUrl: 'aurora.webp' }
  });

  const { videos } = env;
  await new Promise((r) => setTimeout(r, 30));

  // Assert: In Performance Mode, videos must never play
  assert.equal(videos[0].playCalls, 0, 'No play calls in Performance Mode');
  assert.equal(videos[1].playCalls, 0, 'No play calls in Performance Mode');

  // Tab hidden -> visible
  env.setDocumentHidden(true);
  env.setDocumentHidden(false);
  await new Promise((r) => setTimeout(r, 30));

  assert.equal(videos[0].playCalls, 0, 'No play calls after visible in Performance Mode');
  assert.equal(videos[1].playCalls, 0, 'No play calls after visible in Performance Mode');
  videos.forEach((v) => assert.equal(v.paused, true, 'Videos must stay paused in Performance Mode'));
});

test('5. Battery Saver restriction strictly prevents video playback on return', async () => {
  const env = createWallpaperVisibilityEnvironment({
    initialBatteryPref: true,
    initialBatteryDischarging: false,
    initialType: 'video',
    initialSelection: { id: 'wp-dusk', videoUrl: 'dusk.mp4', posterUrl: 'dusk.webp' }
  });

  const { videos } = env;
  await new Promise((r) => setTimeout(r, 30));

  const activeVideo = videos.find((v) => v.classList.contains('is-active'));
  assert.ok(activeVideo, 'Active video exists initially on AC power');

  // Tab hidden: laptop is unplugged (battery discharging)
  env.setDocumentHidden(true);
  env.setBatteryDischarging(true);

  // Tab visible
  env.setDocumentHidden(false);
  await new Promise((r) => setTimeout(r, 30));

  // Assert: Battery saver restriction must pause playback and prevent video restart
  videos.forEach((v) => {
    assert.equal(v.paused, true, 'Videos must be paused when battery saver restriction is active');
  });
});

test('6. Stale asynchronous callback: mode changed to Performance Mode while loading', async () => {
  const env = createWallpaperVisibilityEnvironment({
    initialHidden: true,
    initialPerfMode: false,
    initialType: 'video',
    initialSelection: { id: 'wp-stream', videoUrl: 'stream.mp4', posterUrl: 'stream.webp' }
  });

  const { context, videos } = env;

  // Turn Performance Mode ON while hidden and loading
  env.setPerformanceMode(true);
  context.cleanupBackgroundPlayback();

  // Wait for any in-flight source load promises to settle
  await new Promise((r) => setTimeout(r, 40));

  // Tab becomes visible
  env.setDocumentHidden(false);
  await new Promise((r) => setTimeout(r, 30));

  // Assert: Mode change must prevent stale callback from restarting video
  videos.forEach((v) => {
    assert.equal(v.paused, true, 'Video must not play after Performance Mode was enabled while loading');
    assert.equal(v.playCalls, 0, 'No play calls should have been made');
  });
});

test('7. Stale asynchronous callback: wallpaper selection changed while loading', async () => {
  const env = createWallpaperVisibilityEnvironment({
    initialHidden: true,
    initialType: 'video',
    initialSelection: { id: 'wp-first', videoUrl: 'first.mp4', posterUrl: 'first.webp' }
  });

  const { context, videos } = env;

  // Switch to a new wallpaper while hidden
  const newSelection = { id: 'wp-second', videoUrl: 'second.mp4', posterUrl: 'second.webp' };
  context.applyWallpaperByType(newSelection, 'video');

  await new Promise((r) => setTimeout(r, 40));

  // Tab becomes visible
  env.setDocumentHidden(false);
  await new Promise((r) => setTimeout(r, 40));

  // Assert: Current selection is second wallpaper, and first was discarded
  const currentSel = context.HomebaseWallpaperController.getCurrentWallpaperSelection();
  assert.equal(currentSel.id, 'wp-second', 'Active selection must be the second wallpaper');
});

test('8. Repeated hide/show transitions do not accumulate duplicate playback cycles', async () => {
  const env = createWallpaperVisibilityEnvironment({
    initialType: 'video',
    initialSelection: { id: 'wp-rapid', videoUrl: 'rapid.mp4', posterUrl: 'rapid.webp' }
  });

  const { videos } = env;
  await new Promise((r) => setTimeout(r, 30));

  const activeVideo = videos.find((v) => v.classList.contains('is-active'));
  assert.ok(activeVideo, 'Initial active video exists');
  const basePlayCalls = activeVideo.playCalls;

  // Perform 10 rapid hide/show cycles
  for (let i = 0; i < 10; i++) {
    env.setDocumentHidden(true);
    assert.equal(activeVideo.paused, true, `Cycle ${i}: must be paused on hide`);
    env.setDocumentHidden(false);
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(activeVideo.paused, false, `Cycle ${i}: must resume on show`);
  }

  // Exactly 1 play call per show transition
  assert.equal(activeVideo.playCalls, basePlayCalls + 10, 'Exactly 1 play() per visibility resume without duplication');
  const activeCount = videos.filter((v) => v.classList.contains('is-active')).length;
  assert.equal(activeCount, 1, 'Exactly one active video in DOM at all times');
});

test('9. Search-focus behavior is preserved across visibility changes regardless of playback', async () => {
  const env = createWallpaperVisibilityEnvironment({
    initialPerfMode: true, // Even in Performance Mode
    initialType: 'static'  // Even on Static Wallpaper
  });

  env.resetSearchFocused();
  assert.equal(env.isSearchFocused(), false);

  // Tab hidden -> visible
  env.setDocumentHidden(true);
  env.setDocumentHidden(false);

  // Allow 50ms search-focus setTimeout to execute
  await new Promise((r) => setTimeout(r, 70));

  assert.equal(env.isSearchFocused(), true, 'Search input focus must be triggered on visible even when video is skipped');

  // Verify modal-open guard
  env.resetSearchFocused();
  env.doc.body.classList.add('modal-open');

  env.setDocumentHidden(true);
  env.setDocumentHidden(false);
  await new Promise((r) => setTimeout(r, 70));

  assert.equal(env.isSearchFocused(), false, 'Search input focus must be skipped when modal is open');
});

test('10. Active video ended while hidden resets crossfade cleanly on return', async () => {
  const env = createWallpaperVisibilityEnvironment({
    initialPerfMode: false,
    initialType: 'video',
    initialSelection: { id: 'wp-ended', videoUrl: 'ended.mp4', posterUrl: 'ended.webp' }
  });

  const { videos } = env;
  await new Promise((r) => setTimeout(r, 30));

  const activeVideo = videos.find((v) => v.classList.contains('is-active'));
  assert.ok(activeVideo, 'Active video exists initially');

  // Hide tab
  env.setDocumentHidden(true);
  assert.equal(activeVideo.paused, true, 'Active video paused on hide');

  // Simulate video reached the end while hidden
  activeVideo.ended = true;
  activeVideo.currentTime = activeVideo.duration;

  // Return to tab
  env.setDocumentHidden(false);
  await new Promise((r) => setTimeout(r, 40));

  // Should have reset crossfade and started playing
  const newActive = videos.find((v) => v.classList.contains('is-active'));
  assert.ok(newActive, 'Active video re-established after ended reset');
  assert.equal(newActive.paused, false, 'Playback resumed after ended reset');
});

test('11. Stale video-frame/rAF callback after Performance Mode enabled (with hide/show cycle) cannot mark video is-active or restart playback', async () => {
  let delayedFrameCallbacks = [];
  const env = createWallpaperVisibilityEnvironment({
    initialPerfMode: false,
    initialType: 'video',
    initialSelection: { id: 'wp-stale-frame', videoUrl: 'stale.mp4', posterUrl: 'stale.webp' }
  });

  const { videos } = env;
  videos.forEach((v) => {
    v.requestVideoFrameCallback = (cb) => {
      delayedFrameCallbacks.push(cb);
    };
  });

  env.context.cleanupBackgroundPlayback();
  assert.equal(videos[0].classList.contains('is-active'), false);
  env.context.setupBackgroundVideoCrossfade();
  await new Promise((r) => setTimeout(r, 10));

  assert.equal(delayedFrameCallbacks.length > 0, true, 'Frame callback was queued');

  // Hide tab -> enable Performance Mode -> show tab
  env.setDocumentHidden(true);
  env.setPerformanceMode(true);
  env.setDocumentHidden(false);

  // Fire stale frame callback
  delayedFrameCallbacks.forEach((cb) => {
    try { cb(0, {}); } catch (_) {}
  });
  await new Promise((r) => setTimeout(r, 30));

  assert.equal(videos[0].classList.contains('is-active'), false, 'Stale frame callback must not add is-active after Performance Mode enabled');
  assert.equal(videos[0].paused, true, 'Video must remain paused');
});

test('12. Stale video-frame/rAF callback after wallpaper selection change (with hide/show cycle) cannot activate old wallpaper', async () => {
  let delayedFrameCallbacks = [];
  const env = createWallpaperVisibilityEnvironment({
    initialPerfMode: false,
    initialType: 'video',
    initialSelection: { id: 'wp-first', videoUrl: 'first.mp4', posterUrl: 'first.webp' }
  });

  const { videos } = env;
  videos.forEach((v) => {
    v.requestVideoFrameCallback = (cb) => {
      delayedFrameCallbacks.push(cb);
    };
  });

  env.context.cleanupBackgroundPlayback();
  env.context.setupBackgroundVideoCrossfade();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(delayedFrameCallbacks.length > 0, true, 'Frame callback queued for wp-first');
  const oldCallbacks = [...delayedFrameCallbacks];
  delayedFrameCallbacks = [];

  // Hide tab -> switch to a static wallpaper -> show tab
  env.setDocumentHidden(true);
  env.context.applyWallpaperByType({ id: 'wp-second', videoUrl: '', posterUrl: 'second.webp' }, 'static');
  env.setDocumentHidden(false);

  // Fire stale frame callback from wp-first
  oldCallbacks.forEach((cb) => {
    try { cb(0, {}); } catch (_) {}
  });
  await new Promise((r) => setTimeout(r, 30));

  assert.equal(videos[0].classList.contains('is-active'), false, 'Stale frame callback must not mark old video is-active');
  assert.equal(env.context.lastAppliedWallpaper.id, 'wp-second', 'Active wallpaper remains wp-second');
  assert.equal(env.context.lastAppliedWallpaper.type, 'static', 'Active wallpaper type remains static');
});

test('13. Interrupted crossfade: completion timer executed while hidden resolves cleanly and advances through subsequent loops', async () => {
  const env = createWallpaperVisibilityEnvironment({
    useControlledTimers: true,
    initialSelection: { id: 'wp-loop-interrupted', videoUrl: 'loop.mp4', posterUrl: 'loop.webp' }
  });

  const { videos } = env;
  await env.settleInitialPlayback();

  // 1. Start a live wallpaper.
  assert.equal(videos[0].classList.contains('is-active'), true, 'Initial active video is videos[0]');
  assert.equal(videos[0].paused, false, 'videos[0] is playing initially');

  // 2. Advance playback until a crossfade starts and its completion timer exists.
  videos[0].currentTime = 13.5;
  videos[0].trigger('timeupdate');
  await env.flushMicrotasks();
  env.advanceTimers(0);
  await env.flushMicrotasks();

  assert.equal(videos[1].classList.contains('is-active'), true, 'Crossfade initiated: videos[1] marked is-active');
  assert.ok(env.context.HomebaseWallpaperController.getActiveCrossfadeTransition(), 'activeCrossfadeTransition must exist');
  assert.ok(env.getPendingTimerCount() > 0, 'Completion timer must be scheduled');

  // 3. Hide the document.
  env.setDocumentHidden(true);
  assert.equal(videos[0].paused, true, 'videos[0] paused on hide');
  assert.equal(videos[1].paused, true, 'videos[1] paused on hide');

  // 4. Execute the completion timer while hidden.
  env.advanceTimers(1500);
  await env.flushMicrotasks();

  // Ensure: No playback starts while hidden.
  assert.equal(videos[0].paused, true, 'videos[0] must not play while hidden');
  assert.equal(videos[1].paused, true, 'videos[1] must not play while hidden');
  assert.equal(videos[0].classList.contains('is-active'), false, 'Old video loses active class while hidden');
  assert.equal(videos[1].classList.contains('is-active'), true, 'New video retains active class while hidden');
  assert.equal(env.context.HomebaseWallpaperController.getActiveCrossfadeTransition(), null, 'Transition completed cleanly');

  // 5. Show the document again.
  env.setDocumentHidden(false);
  await env.flushMicrotasks();

  // Returning resolves or safely resets the interrupted crossfade.
  assert.equal(videos[1].paused, false, 'videos[1] resumed playback on visible');
  assert.equal(videos[0].paused, true, 'videos[0] stays paused');
  assert.equal(videos[1].classList.contains('is-active'), true);
  assert.equal(videos[0].classList.contains('is-active'), false);
  assert.equal(videos.filter((v) => v.classList.contains('is-active')).length, 1, 'Only one video active');

  // 6. Advance through at least two further video loops.
  // Loop 1: Advance videos[1] until it crossfades to videos[0]
  videos[1].currentTime = 13.5;
  videos[1].trigger('timeupdate');
  await env.flushMicrotasks();
  env.advanceTimers(0);
  await env.flushMicrotasks();
  env.advanceTimers(1500);
  await env.flushMicrotasks();

  assert.equal(videos[0].classList.contains('is-active'), true, 'Loop 1: videos[0] is active');
  assert.equal(videos[1].classList.contains('is-active'), false, 'Loop 1: videos[1] is inactive');
  assert.equal(videos[0].paused, false, 'Loop 1: videos[0] is playing');
  assert.equal(videos.filter((v) => v.classList.contains('is-active')).length, 1, 'Only one video active in Loop 1');

  // Loop 2: Advance videos[0] until it crossfades to videos[1]
  videos[0].currentTime = 13.5;
  videos[0].trigger('timeupdate');
  await env.flushMicrotasks();
  env.advanceTimers(0);
  await env.flushMicrotasks();
  env.advanceTimers(1500);
  await env.flushMicrotasks();

  assert.equal(videos[1].classList.contains('is-active'), true, 'Loop 2: videos[1] is active');
  assert.equal(videos[0].classList.contains('is-active'), false, 'Loop 2: videos[0] is inactive');
  assert.equal(videos[1].paused, false, 'Loop 2: videos[1] is playing');
  assert.equal(videos.filter((v) => v.classList.contains('is-active')).length, 1, 'Only one video active in Loop 2');
});

test('14. Interrupted crossfade: hiding while next video play/frame callback is pending resolves cleanly on return', async () => {
  const env = createWallpaperVisibilityEnvironment({
    useControlledTimers: true,
    initialSelection: { id: 'wp-pending-cb', videoUrl: 'pending.mp4', posterUrl: 'pending.webp' }
  });

  const { videos } = env;
  await env.settleInitialPlayback();

  assert.equal(videos[0].classList.contains('is-active'), true, 'Initial active video is videos[0]');

  // Intercept requestVideoFrameCallback on videos[1] so the frame callback is pending
  let queuedFrameCb = null;
  videos[1].requestVideoFrameCallback = (cb) => { queuedFrameCb = cb; };

  // Advance videos[0] to start crossfade
  videos[0].currentTime = 13.5;
  videos[0].trigger('timeupdate');
  await env.flushMicrotasks();

  // doFade has started, videos[1].play() was called, but frame callback is pending
  assert.ok(queuedFrameCb !== null, 'Frame callback is pending on videos[1]');
  assert.equal(videos[1].classList.contains('is-active'), false, 'videos[1] not yet marked is-active');
  assert.ok(env.context.HomebaseWallpaperController.getActiveCrossfadeTransition() !== null, 'activeCrossfadeTransition is pending');

  // Hide the document while next video play/frame callback is pending
  env.setDocumentHidden(true);
  assert.equal(videos[0].paused, true, 'videos[0] paused on hide');
  assert.equal(videos[1].paused, true, 'videos[1] paused on hide');

  // Return to the tab
  env.setDocumentHidden(false);
  await env.flushMicrotasks();

  // Returning resolves or safely resets the interrupted crossfade
  assert.equal(env.context.HomebaseWallpaperController.getActiveCrossfadeTransition(), null, 'Transition resolved on return');
  assert.equal(videos[1].classList.contains('is-active'), true, 'videos[1] resolved to active');
  assert.equal(videos[0].classList.contains('is-active'), false, 'videos[0] is no longer active');
  assert.equal(videos[1].paused, false, 'videos[1] resumed playback');
  assert.equal(videos.filter((v) => v.classList.contains('is-active')).length, 1, 'Only one video active');

  // Restore normal frame callback on videos[1]
  videos[1].requestVideoFrameCallback = (cb) => env.envSetTimeout(() => cb(0, {}), 0);

  // If the stale frame callback fires now, verify it does not corrupt active state
  if (queuedFrameCb) {
    try { queuedFrameCb(0, {}); } catch (_) {}
    queuedFrameCb = null;
  }
  await env.flushMicrotasks();
  assert.equal(videos[1].classList.contains('is-active'), true);
  assert.equal(videos[0].classList.contains('is-active'), false);
  assert.equal(videos.filter((v) => v.classList.contains('is-active')).length, 1);

  // Advance through at least two further video loops
  // Loop 1: Advance videos[1] to crossfade to videos[0]
  videos[1].currentTime = 13.5;
  videos[1].trigger('timeupdate');
  await env.flushMicrotasks();
  env.advanceTimers(0);
  await env.flushMicrotasks();
  env.advanceTimers(1500);
  await env.flushMicrotasks();

  assert.equal(videos[0].classList.contains('is-active'), true, 'Loop 1: videos[0] is active');
  assert.equal(videos[1].classList.contains('is-active'), false, 'Loop 1: videos[1] is inactive');
  assert.equal(videos[0].paused, false, 'Loop 1: videos[0] is playing');

  // Loop 2: Advance videos[0] to crossfade to videos[1]
  videos[0].currentTime = 13.5;
  videos[0].trigger('timeupdate');
  await env.flushMicrotasks();
  env.advanceTimers(0);
  await env.flushMicrotasks();
  env.advanceTimers(1500);
  await env.flushMicrotasks();

  assert.equal(videos[1].classList.contains('is-active'), true, 'Loop 2: videos[1] is active');
  assert.equal(videos[0].classList.contains('is-active'), false, 'Loop 2: videos[0] is inactive');
  assert.equal(videos[1].paused, false, 'Loop 2: videos[1] is playing');
  assert.equal(videos.filter((v) => v.classList.contains('is-active')).length, 1, 'Exactly one video active');
});

test('15. Transition ownership: delayed callback from interrupted transition A cannot mutate transition B timer or state', async () => {
  const env = createWallpaperVisibilityEnvironment({
    useControlledTimers: true,
    initialSelection: { id: 'wp-ownership', videoUrl: 'ownership.mp4', posterUrl: 'ownership.webp' }
  });

  const { videos } = env;
  await env.settleInitialPlayback();

  assert.equal(videos[0].classList.contains('is-active'), true, 'Initial active video is videos[0]');

  // 1. Interrupt transition A while its frame callback is pending.
  let delayedCallbackA = null;
  videos[1].requestVideoFrameCallback = (cb) => { delayedCallbackA = cb; };

  videos[0].currentTime = 13.5;
  videos[0].trigger('timeupdate');
  await env.flushMicrotasks();

  const transitionA = env.context.HomebaseWallpaperController.getActiveCrossfadeTransition();
  assert.ok(transitionA, 'Transition A must be active');
  assert.ok(delayedCallbackA !== null, 'Transition A frame callback is captured');

  env.setDocumentHidden(true);
  assert.equal(videos[0].paused, true, 'videos[0] paused on hide');
  assert.equal(videos[1].paused, true, 'videos[1] paused on hide');

  // 2. Return to visibility and finish A through the resume path.
  videos[1].requestVideoFrameCallback = (cb) => env.envSetTimeout(() => cb(0, {}), 0);
  videos[0].requestVideoFrameCallback = (cb) => env.envSetTimeout(() => cb(0, {}), 0);

  env.setDocumentHidden(false);
  await env.flushMicrotasks();

  assert.equal(env.context.HomebaseWallpaperController.getActiveCrossfadeTransition(), null, 'Transition A resolved on return');
  assert.equal(videos[1].classList.contains('is-active'), true, 'videos[1] became active via resume');
  assert.equal(videos[0].classList.contains('is-active'), false, 'videos[0] became inactive via resume');
  assert.equal(videos[1].paused, false, 'videos[1] resumed playback');

  // 3. Advance playback until transition B starts.
  videos[1].currentTime = 13.5;
  videos[1].trigger('timeupdate');
  await env.flushMicrotasks();
  env.advanceTimers(0);
  await env.flushMicrotasks();

  const transitionB = env.context.HomebaseWallpaperController.getActiveCrossfadeTransition();
  assert.ok(transitionB, 'Transition B must be active');
  assert.notEqual(transitionB, transitionA, 'Transition B is distinct from Transition A');
  assert.equal(transitionB.from, videos[1], 'Transition B fades from videos[1]');
  assert.equal(transitionB.to, videos[0], 'Transition B fades to videos[0]');

  const timerCountBeforeA = env.getPendingTimerCount();
  assert.ok(timerCountBeforeA > 0, 'Transition B completion timer is scheduled');

  // 4. Deliver A's delayed callback.
  delayedCallbackA(0, {});
  await env.flushMicrotasks();
  env.advanceTimers(0);
  await env.flushMicrotasks();

  // 5. Verify B's timer/state are unchanged and playback continues normally.
  assert.equal(env.context.HomebaseWallpaperController.getActiveCrossfadeTransition(), transitionB, 'Transition B remains active transition');
  assert.equal(env.getPendingTimerCount(), timerCountBeforeA, 'Transition B timer is unchanged and not overwritten by A');

  // Advance Transition B through completion
  env.advanceTimers(1500);
  await env.flushMicrotasks();

  assert.equal(env.context.HomebaseWallpaperController.getActiveCrossfadeTransition(), null, 'Transition B completed cleanly');
  assert.equal(videos[0].classList.contains('is-active'), true, 'videos[0] is active after transition B');
  assert.equal(videos[1].classList.contains('is-active'), false, 'videos[1] is inactive after transition B');
  assert.equal(videos[0].paused, false, 'videos[0] is playing after transition B');
  assert.equal(videos.filter((v) => v.classList.contains('is-active')).length, 1, 'Exactly one video active');

  // Advance through one further video loop to confirm normal playback continues
  videos[0].currentTime = 13.5;
  videos[0].trigger('timeupdate');
  await env.flushMicrotasks();
  env.advanceTimers(0);
  await env.flushMicrotasks();
  env.advanceTimers(1500);
  await env.flushMicrotasks();

  assert.equal(videos[1].classList.contains('is-active'), true, 'Next loop: videos[1] is active');
  assert.equal(videos[0].classList.contains('is-active'), false, 'Next loop: videos[0] is inactive');
  assert.equal(videos[1].paused, false, 'Next loop: videos[1] is playing');
  assert.equal(videos.filter((v) => v.classList.contains('is-active')).length, 1, 'Exactly one video active in next loop');
});

test('16. Markup coverage: background video elements do not declare autoplay', () => {
  const htmlPath = path.join(rootDir, 'src/new-tab.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  const videoTagMatches = html.match(/<video[^>]*class=["'][^"']*background-video[^"']*["'][^>]*>/gi) || [];
  assert.ok(videoTagMatches.length >= 2, 'Must find at least 2 background-video elements in new-tab.html');

  for (const tag of videoTagMatches) {
    assert.equal(
      /\bautoplay\b/i.test(tag),
      false,
      `Video element "${tag}" must not declare the autoplay attribute so the wallpaper controller is the single canonical owner of playback`
    );
    assert.equal(
      /\bmuted\b/i.test(tag),
      true,
      `Video element "${tag}" must declare muted`
    );
    assert.equal(
      /\bplaysinline\b/i.test(tag),
      true,
      `Video element "${tag}" must declare playsinline`
    );
    assert.equal(
      /\bpreload=["']none["']/i.test(tag),
      true,
      `Video element "${tag}" must declare preload="none"`
    );
  }
});

test('17. Tab becomes hidden before scheduled source loading executes: load aborted and resumes cleanly on visible', async () => {
  const env = createWallpaperVisibilityEnvironment({
    initialHidden: false,
    initialType: 'video',
    initialSelection: { id: 'wp-sunset', videoUrl: 'sunset.mp4', posterUrl: 'sunset.webp' }
  });

  const { videos } = env;

  // Trigger a new wallpaper source load
  const p = env.context.setBackgroundVideoSources('sunset2.mp4', 'sunset2.webp');

  // Immediately hide document before scheduled rAF runs
  env.setDocumentHidden(true);

  await p;
  await new Promise((r) => setTimeout(r, 30));

  // Assert: While hidden, videos must not be loading or playing
  videos.forEach((v) => {
    assert.equal(v.paused, true, 'Videos must remain paused while hidden');
    assert.equal(v.playCalls, 0, 'No play calls while hidden');
  });

  // Now return to the tab: Hidden -> Visible
  env.setDocumentHidden(false);
  await new Promise((r) => setTimeout(r, 50));

  // Active video should be playing the current eligible wallpaper
  const activeVideo = videos.find((v) => v.classList.contains('is-active'));
  assert.ok(activeVideo, 'Active video must exist after returning to tab');
  assert.equal(activeVideo.paused, false, 'Active video must resume playback on visible');
  assert.ok(activeVideo.playCalls >= 1, 'Active video must have called play()');
});

test('18. Tab starts hidden and later becomes visible: source loading deferred until visible', async () => {
  const env = createWallpaperVisibilityEnvironment({
    initialHidden: true,
    initialType: 'video',
    initialSelection: { id: 'wp-hidden-start', videoUrl: 'hidden.mp4', posterUrl: 'hidden.webp' }
  });

  const { videos } = env;
  await new Promise((r) => setTimeout(r, 30));

  // While hidden, no video elements should have loaded media or started playing
  videos.forEach((v, idx) => {
    assert.equal(v.paused, true, `Video ${idx} must be paused while hidden`);
    assert.equal(v.playCalls, 0, `Video ${idx} must have 0 play calls while hidden`);
  });

  // Now become visible
  env.setDocumentHidden(false);
  await new Promise((r) => setTimeout(r, 50));

  // Active video should now be loaded and playing
  const activeVideo = videos.find((v) => v.classList.contains('is-active'));
  assert.ok(activeVideo, 'Active video must be set up after becoming visible');
  assert.equal(activeVideo.paused, false, 'Active video must be playing after becoming visible');
  assert.ok(activeVideo.playCalls >= 1, 'Active video must have called play()');
});

test('19. Rapid repeated hide/show during initialization: settles cleanly with exactly 1 active playback', async () => {
  const env = createWallpaperVisibilityEnvironment({
    initialHidden: false,
    initialType: 'video',
    initialSelection: { id: 'wp-rapid-init', videoUrl: 'rapid.mp4', posterUrl: 'rapid.webp' }
  });

  const { videos } = env;

  // Toggle hide/show rapidly during early initialization
  for (let i = 0; i < 5; i++) {
    env.setDocumentHidden(true);
    await new Promise((r) => setTimeout(r, 5));
    env.setDocumentHidden(false);
    await new Promise((r) => setTimeout(r, 5));
  }

  // Allow final visible state to settle
  await new Promise((r) => setTimeout(r, 60));

  const activeVideos = videos.filter((v) => v.classList.contains('is-active'));
  assert.equal(activeVideos.length, 1, 'Exactly one active video in DOM after rapid hide/show cycles');
  assert.equal(activeVideos[0].paused, false, 'The single active video must be playing');
});

test('20. Selection or Performance Mode changes while loading is pending', async () => {
  // Part A: Selection change while loading is pending
  const envA = createWallpaperVisibilityEnvironment({
    initialHidden: false,
    initialType: 'video',
    initialSelection: { id: 'wp-first', videoUrl: 'first.mp4', posterUrl: 'first.webp' },
    useControlledTimers: true
  });

  // Immediately apply a second selection while first is pending
  envA.context.applyWallpaperByType(
    { id: 'wp-second', videoUrl: 'second.mp4', posterUrl: 'second.webp' },
    'video'
  );

  await envA.flushMicrotasks();
  envA.advanceTimers(20);
  await envA.flushMicrotasks();

  // Current selection in controller must be wp-second, and wp-first must not play
  assert.equal(
    envA.context.HomebaseWallpaperController.getCurrentWallpaperSelection().id,
    'wp-second',
    'Current wallpaper selection should be wp-second'
  );

  // Part B: Performance Mode enabled while loading is pending
  const envB = createWallpaperVisibilityEnvironment({
    initialHidden: false,
    initialType: 'video',
    initialSelection: { id: 'wp-perf-pending', videoUrl: 'perf.mp4', posterUrl: 'perf.webp' },
    useControlledTimers: true
  });

  // Turn ON Performance Mode immediately
  envB.setPerformanceMode(true);
  await envB.flushMicrotasks();
  envB.advanceTimers(20);
  await envB.flushMicrotasks();

  // All videos must be paused with 0 play calls
  envB.videos.forEach((v, idx) => {
    assert.equal(v.paused, true, `Video ${idx} must stay paused in Performance Mode`);
    assert.equal(v.playCalls, 0, `Video ${idx} must have 0 play calls in Performance Mode`);
  });
});

test('21. No duplicate playback setup after resuming', async () => {
  const env = createWallpaperVisibilityEnvironment({
    initialHidden: false,
    initialType: 'video',
    initialSelection: { id: 'wp-no-dup', videoUrl: 'nodup.mp4', posterUrl: 'nodup.webp' }
  });

  const { videos } = env;
  await new Promise((r) => setTimeout(r, 40));

  const activeVideo = videos.find((v) => v.classList.contains('is-active'));
  assert.ok(activeVideo, 'Initial active video exists');
  const basePlayCalls = activeVideo.playCalls;

  // Transition to hidden
  env.setDocumentHidden(true);
  assert.equal(activeVideo.paused, true, 'Active video paused on hide');

  // Resume to visible
  env.setDocumentHidden(false);
  await new Promise((r) => setTimeout(r, 30));

  // Assert: activeVideo.play() called exactly once on resume
  assert.equal(activeVideo.playCalls, basePlayCalls + 1, 'play() called exactly once without duplicate setup');
  assert.equal(videos.filter((v) => v.classList.contains('is-active')).length, 1, 'Still exactly one active video');
});

test('22. Explicit cancellation settles source-load operation immediately on hide without flushing animation frames', async () => {
  const env = createWallpaperVisibilityEnvironment({
    initialHidden: false,
    initialType: 'video',
    initialSelection: { id: 'wp-settle-test', videoUrl: 'settle.mp4', posterUrl: 'settle.webp' },
    useControlledTimers: true
  });

  // Let initial setup settle
  await env.settleInitialPlayback();

  // Record initial load calls
  const initialLoadCalls = env.videos.reduce((sum, v) => sum + v.loadCalls, 0);

  let settled = false;
  // Start a new source-load operation that requires DOM updates
  const sourceLoadPromise = env.context.HomebaseWallpaperController.setBackgroundVideoSources('new-source.mp4', 'new-poster.webp')
    .then(() => {
      settled = true;
    });

  // At this point, animation frame has been scheduled but timers/frames have NOT advanced
  assert.equal(settled, false, 'Operation must be pending before animation frames fire');
  assert.equal(env.videos.reduce((sum, v) => sum + v.loadCalls, 0), initialLoadCalls, 'No v.load() called before rAF executes');

  // Hide the document BEFORE animation frames execute.
  // Crucially: do NOT flush or advance animation frames while hidden!
  env.setDocumentHidden(true);

  // The canceled operation must settle immediately without requiring animation frames to flush
  await sourceLoadPromise;
  assert.equal(settled, true, 'Canceled operation must settle immediately upon hide');

  // Verify that NO video load was performed
  assert.equal(env.videos.reduce((sum, v) => sum + v.loadCalls, 0), initialLoadCalls, 'Canceled operation must perform no video load');

  // Even if animation frames or timers are later flushed after the fact, video load must STILL not occur
  env.advanceTimers(100);
  await env.flushMicrotasks();
  assert.equal(env.videos.reduce((sum, v) => sum + v.loadCalls, 0), initialLoadCalls, 'Flushing later must still perform no video load for canceled operation');
});

test('23. Switching wallpaper A to B while A resume awaits source loading: A must not overwrite B state or start stale playback', async () => {
  const env = createWallpaperVisibilityEnvironment({
    initialHidden: false,
    initialType: 'video',
    initialSelection: { id: 'wp-A', videoUrl: 'video-A.mp4', posterUrl: 'poster-A.webp' },
    useControlledTimers: true
  });

  await env.settleInitialPlayback();

  // Tab becomes hidden
  env.setDocumentHidden(true);

  // Invalidate readyState on videos to guarantee A's resume requires source update
  env.videos.forEach((v) => {
    v.readyState = 0;
  });

  // Tab becomes visible. This starts resumeWallpaperPlaybackIfEligible() for wallpaper A.
  // With controlled timers active, setBackgroundVideoSources() schedules rAF without firing,
  // leaving A suspended at `await setBackgroundVideoSources(video, poster)`.
  env.setDocumentHidden(false);
  await env.flushMicrotasks();

  // While A's resume is awaiting source loading, switch active wallpaper from A to B
  const selectionB = { id: 'wp-B', videoUrl: 'video-B.mp4', posterUrl: 'poster-B.webp' };
  env.context.applyWallpaperByType(selectionB, 'video');

  // Advance timers so all pending scheduling completes (settles A and completes B flow)
  env.advanceTimers(100);
  await env.flushMicrotasks();
  env.advanceTimers(100);
  await env.flushMicrotasks();

  // Verify that current selection is B
  const currentSel = env.context.HomebaseWallpaperController.getCurrentWallpaperSelection();
  assert.equal(currentSel.id, 'wp-B', 'Current selection must remain B');

  // Verify that lastAppliedWallpaper was NOT overwritten by A
  const lastApplied = env.context.HomebaseWallpaperController.getLastAppliedWallpaper();
  assert.equal(lastApplied.id, 'wp-B', 'lastAppliedWallpaper must be B, not overwritten by A');
  assert.equal(lastApplied.video, 'video-B.mp4', 'lastAppliedWallpaper video must be B');

  // Verify that no video in DOM is playing A's stale video
  env.videos.forEach((v, idx) => {
    const source = v.querySelector('source');
    const src = source ? source.src : v.src;
    if (!v.paused) {
      assert.notEqual(src, 'video-A.mp4', `Video ${idx} must not be playing stale video A`);
    }
  });
});






