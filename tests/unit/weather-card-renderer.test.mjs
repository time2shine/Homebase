import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const rendererScriptPath = path.join(rootDir, 'src/newtab/widgets/weather-card-renderer.js');
const rendererScriptCode = fs.readFileSync(rendererScriptPath, 'utf8');

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

function createDummyEl() {
  const attrs = new Map();
  const el = {
    classList: createMockClassList(),
    textContent: '',
    appendChild: () => {},
    setAttribute: (k, v) => attrs.set(k, String(v)),
    getAttribute: (k) => attrs.get(k) || null,
    removeAttribute: (k) => attrs.delete(k),
    querySelector: () => createDummyEl(),
    querySelectorAll: () => []
  };
  return el;
}

function createRendererContext() {
  const elements = new Map();
  const getOrCreateEl = (id) => {
    if (!elements.has(id)) elements.set(id, createDummyEl());
    return elements.get(id);
  };

  const sandbox = {
    Object,
    Array,
    Set,
    Map,
    String,
    Number,
    Boolean,
    Date,
    JSON,
    Math,
    document: {
      getElementById: (id) => getOrCreateEl(id),
      querySelector: (sel) => getOrCreateEl(sel)
    },
    setText: (el, val) => { if (el) el.textContent = val; },
    setAttr: (el, attr, val) => { if (el) el.setAttribute(attr, val); },
    revealWidget: () => {}
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  const context = vm.createContext(sandbox);
  vm.runInContext(rendererScriptCode, context);
  return { context, elements };
}

test('weather-card-renderer: window.HomebaseWeatherCardRenderer exports complete API', () => {
  const { context } = createRendererContext();
  const renderer = context.HomebaseWeatherCardRenderer;
  assert.ok(renderer, 'HomebaseWeatherCardRenderer must exist');
  assert.strictEqual(typeof renderer.getWeatherEmoji, 'function');
  assert.strictEqual(typeof renderer.getWeatherDescription, 'function');
  assert.strictEqual(typeof renderer.formatWeatherUpdated, 'function');
  assert.strictEqual(typeof renderer.normalizeWeatherDisplay, 'function');
  assert.strictEqual(typeof renderer.renderWeatherUI, 'function');
  assert.strictEqual(typeof renderer.renderWeatherOfflineUI, 'function');
  assert.strictEqual(typeof renderer.setWeatherLoadingState, 'function');
  assert.strictEqual(typeof renderer.setWeatherSetupUIState, 'function');
});

test('weather-card-renderer: getWeatherEmoji and getWeatherDescription map codes correctly', () => {
  const { context } = createRendererContext();
  const renderer = context.HomebaseWeatherCardRenderer;

  assert.strictEqual(renderer.getWeatherEmoji(0), '☀️');
  assert.strictEqual(renderer.getWeatherDescription(0), 'Clear sky');

  assert.strictEqual(renderer.getWeatherEmoji(2), '⛅');
  assert.strictEqual(renderer.getWeatherDescription(2), 'Partly cloudy');

  assert.strictEqual(renderer.getWeatherEmoji(61), '🌦️');
  assert.strictEqual(renderer.getWeatherDescription(61), 'Rain');

  assert.strictEqual(renderer.getWeatherEmoji(95), '⛈️');
  assert.strictEqual(renderer.getWeatherDescription(95), 'Thunderstorm');

  assert.strictEqual(renderer.getWeatherEmoji(999), '🌡️');
  assert.strictEqual(renderer.getWeatherDescription(999), 'Unknown');
});

test('weather-card-renderer: formatWeatherUpdated handles valid and invalid timestamps', () => {
  const { context } = createRendererContext();
  const renderer = context.HomebaseWeatherCardRenderer;

  const now = new Date('2026-10-12T12:30:00Z').getTime();
  const formatted = renderer.formatWeatherUpdated(now);
  assert.ok(formatted.startsWith('Updated: '));

  const cached = renderer.formatWeatherUpdated(now, { isCached: true, cacheReason: 'Offline cache' });
  assert.ok(cached.startsWith('Offline cache - Updated: '));

  assert.strictEqual(renderer.formatWeatherUpdated(null), '');
  assert.strictEqual(renderer.formatWeatherUpdated('invalid-date'), '');
});

test('weather-card-renderer: normalizeWeatherDisplay normalizes payload correctly', () => {
  const { context } = createRendererContext();
  const renderer = context.HomebaseWeatherCardRenderer;

  const rawData = {
    current_weather: {
      temperature: 21.6,
      weathercode: 1,
      time: '2026-10-12T12:00'
    },
    hourly: {
      time: ['2026-10-12T12:00'],
      wind_speed_10m: [15.2],
      relative_humidity_2m: [55.4],
      cloudcover: [20],
      precipitation_probability: [5]
    },
    daily: {
      sunrise: ['2026-10-12T06:30'],
      sunset: ['2026-10-12T18:45']
    }
  };

  const display = renderer.normalizeWeatherDisplay(rawData, 'London', 'celsius', 1700000000000);
  assert.strictEqual(display.cityName, 'London');
  assert.strictEqual(display.temperature, '22°C');
  assert.strictEqual(display.emoji, '🌤️');
  assert.strictEqual(display.description, 'Mainly clear');
  assert.strictEqual(display.humidity, '55%');
  assert.strictEqual(display.cloudCover, '20%');
  assert.strictEqual(display.precipitationProbability, '5%');
});

test('weather-card-renderer: renderWeatherUI populates DOM and sets classes', () => {
  const { context, elements } = createRendererContext();
  const renderer = context.HomebaseWeatherCardRenderer;

  const display = {
    cityName: 'Tokyo',
    temperature: '18°C',
    description: 'Clear sky',
    emoji: '☀️',
    pressure: '10 km/h',
    humidity: '40%',
    cloudCover: '10%',
    precipitationProbability: '0%',
    sunrise: '06:00 AM',
    sunset: '05:30 PM',
    updatedLabel: 'Updated: 10:00 AM',
    weatherCode: 0,
    isCached: false
  };

  const success = renderer.renderWeatherUI(display);
  assert.strictEqual(success, true);
  assert.strictEqual(elements.get('weather-city').textContent, 'Tokyo');
  assert.strictEqual(elements.get('weather-temp').textContent, '18°C');
  assert.strictEqual(elements.get('weather-icon').textContent, '☀️');
  assert.strictEqual(elements.get('weather-icon').getAttribute('data-weather-code'), '0');
  assert.strictEqual(elements.get('weather-icon').classList.contains('is-instant-icon'), true);
});

test('weather-card-renderer: renderWeatherOfflineUI sets offline state correctly', () => {
  const { context, elements } = createRendererContext();
  const renderer = context.HomebaseWeatherCardRenderer;

  renderer.renderWeatherOfflineUI();
  assert.strictEqual(elements.get('weather-city').textContent, 'Weather Offline');
  assert.strictEqual(elements.get('weather-temp').textContent, '--°');
  assert.strictEqual(elements.get('weather-desc').textContent, 'No cached weather yet');
});

test('weather-card-renderer: setWeatherLoadingState and setWeatherSetupUIState manage UI states', () => {
  const { context } = createRendererContext();
  const renderer = context.HomebaseWeatherCardRenderer;

  const widget = createDummyEl();
  renderer.setWeatherLoadingState(true, { weatherWidget: widget });
  assert.strictEqual(widget.classList.contains('weather-loading'), true);

  renderer.setWeatherLoadingState(false, { weatherWidget: widget });
  assert.strictEqual(widget.classList.contains('weather-loading'), false);

  const setupEl = createDummyEl();
  renderer.setWeatherSetupUIState({ visible: true, isError: true }, { weatherWidget: widget, weatherSetup: setupEl });
  assert.strictEqual(widget.classList.contains('weather-error'), true);
  assert.strictEqual(setupEl.classList.contains('hidden'), false);

  renderer.setWeatherSetupUIState({ visible: false }, { weatherWidget: widget, weatherSetup: setupEl });
  assert.strictEqual(setupEl.classList.contains('hidden'), true);
});
