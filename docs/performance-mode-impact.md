# Homebase — Performance Mode Impact & Measurement Note

**Document Status:** Living Technical Note<br>
**Branch:** `main`<br>
**Reference Commit:** `48cd0b6` (+ uncommitted UI description, animation hardening, and lifecycle fixes)<br>
**Hardware Profile:** AMD Ryzen 5 5600 6-Core Processor (12 logical CPUs, ~3.5–4.4 GHz), 15.92 GB RAM, Windows 11 (`10.0.26200`)<br>
**Target Browsers:** Microsoft Edge `155.0.4283.62`, Mozilla Firefox `158.0`, Google Chrome / Chromium<br>

---

## 1. Overview & Verified Behavior

Performance Mode is Homebase's system resource optimization profile designed for laptops on battery power and lower-spec hardware.

### 1.1 Verified Subsystem Impact (Code Implementation)
When Performance Mode is toggled **ON**:
1. **Live Video Wallpapers**:
   - Background video playback and decode timers are terminated (`cleanupBackgroundPlayback()` / `clearBackgroundVideos()`).
   - The selected live wallpaper is retained and displays its still poster image.
   - In Settings and Gallery, switching from Static to Live Video is disabled, but existing Live Video selections can switch to Static.
   - An inline notice and a "Turn off Performance Mode" action button are displayed.
2. **Background Blur**:
   - Real-time `backdrop-filter: blur(...)` filters are disabled across overlays, modals, and dock (`--glass-blur: 0px`, `--overlay-blur: 0px`).
   - Dialogs and menus fall back to clean solid surfaces.
   - Bookmark blur is removed while strictly preserving user-configured Transparent Background or Custom Background color and opacity settings.
3. **Animations**:
   - Bookmark grid entrance animations are disabled and dynamic animation style injection is suppressed.
   - Modal opening entrance animations are bypassed for immediate display (`modal-settled`), while closing shrink animations (`pickerOut`) remain fully functional.
4. **Cinema Mode**:
   - Cinema Mode runtime listeners and sub-settings are disabled and hidden.
5. **Saved Appearance Preferences**:
   - Zero settings are erased or overwritten in persistent storage; toggling Performance Mode OFF restores all user-configured video playback, blur, and animation settings instantly.

---

## 2. Benchmark Status & Observation Records

### 2.1 Automated Measurement Status
The attempted automated setup did not reliably load and measure the installed extension; no automated performance results were obtained.

### 2.2 User-Reported Testing (October 18, 2026)
User-reported testing conducted on October 18, 2026 recorded the following observations in a live browser setup:
- **Performance Mode OFF**: Idle CPU generally observed around **1–4%**.
- **Performance Mode ON**: Idle CPU generally observed around **0.02–1.3%**.
- The user repeated the comparison and observed similar results.
- Findings suggest reduced idle CPU usage in the tested setup.

**Data Scope & Boundaries:**
- Exact browser/version, sample timing, and complete repeated-run data were not supplied.
- No claim is made regarding a precise percentage reduction, battery/GPU savings, or faster startup.

---

## 3. Standardized Manual Measurement Protocol

Use this protocol to measure Performance Mode impact under identical conditions:

### 3.1 Setup & Test Conditions
1. **Build**: Unpacked build from `dist/chrome`, `dist/edge`, or `dist/firefox`.
2. **Environment**: Single visible, foregrounded browser window; close all unrelated tabs and non-essential background extensions.
3. **Wallpaper**: Pre-packaged video wallpaper (e.g. *Clouds* live video).
4. **Measurement Tool**: Browser built-in Task Manager:
   - Chromium / Edge: Press `Shift + Esc` -> find `Extension: Homebase` or `Tab: Homebase`.
   - Firefox: Open `about:processes` -> find the `Homebase` tab.

### 3.2 Metrics Definition
- **Startup Time (ms)**: Time elapsed from navigation start to ready state (`body.classList.contains('ready')`), accessible via `performance.getEntriesByType('navigation')[0].loadEventEnd` or Homebase's Perf Debug Overlay.
- **Idle CPU (%)**: Observed CPU consumption of the Homebase process measured over a fixed 30-second window, beginning 5 seconds after tab load has completely settled.

### 3.3 Test Matrix (Alternating Order)

| Run # | Mode | Wallpaper | Startup Time (ms) | Idle CPU % (Min) | Idle CPU % (Max) | Idle CPU % (Avg) | Memory (MB) |
|---|---|---|---|---|---|---|---|
| **Run 1** | **OFF** | Live Video (Clouds) | _[record]_ | _[record]_ | _[record]_ | _[record]_ | _[record]_ |
| **Run 2** | **ON** | Live Video (Poster) | _[record]_ | _[record]_ | _[record]_ | _[record]_ | _[record]_ |
| **Run 3** | **OFF** | Live Video (Clouds) | _[record]_ | _[record]_ | _[record]_ | _[record]_ | _[record]_ |
| **Run 4** | **ON** | Live Video (Poster) | _[record]_ | _[record]_ | _[record]_ | _[record]_ | _[record]_ |
| **Run 5** | **OFF** | Live Video (Clouds) | _[record]_ | _[record]_ | _[record]_ | _[record]_ | _[record]_ |
| **Run 6** | **ON** | Live Video (Poster) | _[record]_ | _[record]_ | _[record]_ | _[record]_ | _[record]_ |
| *Run 7 (Baseline)* | *OFF* | Static Wallpaper | _[record]_ | _[record]_ | _[record]_ | _[record]_ | _[record]_ |
| *Run 8 (Baseline)* | *ON* | Static Wallpaper | _[record]_ | _[record]_ | _[record]_ | _[record]_ | _[record]_ |

### 3.4 Analysis Instructions
- Compute the median and range for Startup Time and Idle CPU Average across Runs 1, 3, 5 (OFF) versus Runs 2, 4, 6 (ON).
- Record the delta: `Δ CPU = Median(OFF) - Median(ON)`.
