// Shared static data and helper utilities for the new tab page.

const GRID_ANIMATIONS = {
  'default': {
    name: 'Default (Drop In)',
    css: '0% { opacity: 0; transform: scale(0.98) translateY(-25px); } 100% { opacity: 1; transform: scale(1) translateY(0); }'
  },
  'pop': {
    name: 'Pop (Bouncy)',
    css: '0% { opacity: 0; transform: scale(0.5); } 60% { opacity: 1; transform: scale(1.05); } 100% { opacity: 1; transform: scale(1); }'
  },
  'glide-up': {
    name: 'Glide Up',
    css: 'from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); }'
  },
  'glide-down': {
    name: 'Glide Down',
    css: '0% { transform: translateY(-100px); opacity: 0; } 100% { transform: translateY(0); opacity: 1; }'
  },
  'slide-right': {
    name: 'Slide Right',
    css: '0% { transform: translateX(-50px); opacity: 0; } 100% { transform: translateX(0); opacity: 1; }'
  },
  'slide-left': {
    name: 'Slide Left',
    css: '0% { transform: translateX(50px); opacity: 0; } 100% { transform: translateX(0); opacity: 1; }'
  },
  'scale-in-center': {
    name: 'Scale In',
    css: '0% { transform: scale(0); opacity: 1; } 100% { transform: scale(1); opacity: 1; }'
  },
  'swirl-in': {
    name: 'Swirl In',
    css: '0% { transform: rotate(-540deg) scale(0); opacity: 0; } 100% { transform: rotate(0) scale(1); opacity: 1; }'
  },
  'flip-hor': {
    name: 'Flip Horizontal',
    css: '0% { transform: rotateX(80deg); opacity: 0; } 100% { transform: rotateX(0); opacity: 1; }'
  },
  'flip-ver': {
    name: 'Flip Vertical',
    css: '0% { transform: rotateY(-80deg); opacity: 0; } 100% { transform: rotateY(0); opacity: 1; }'
  },
  'swing-in': {
    name: 'Swing In',
    css: '0% { transform: rotateX(-100deg); transform-origin: top; opacity: 0; } 100% { transform: rotateX(0deg); transform-origin: top; opacity: 1; }'
  },
  'puff-in': {
    name: 'Puff In',
    css: '0% { transform: scale(2); filter: blur(4px); opacity: 0; } 100% { transform: scale(1); filter: blur(0px); opacity: 1; }'
  },
  'blur-fade': {
    name: 'Blur Fade',
    css: '0% { opacity: 0; filter: blur(10px); transform: scale(0.95); } 100% { opacity: 1; filter: blur(0); transform: scale(1); }'
  },
  'elastic': {
    name: 'Elastic Snap',
    css: '0% { transform: scale(0.3); opacity: 0; } 50% { transform: scale(1.1); opacity: 1; } 70% { transform: scale(0.9); } 100% { transform: scale(1); opacity: 1; }'
  },
  'roll-in': {
    name: 'Roll In',
    css: '0% { transform: translateX(-100px) rotate(-540deg); opacity: 0; } 100% { transform: translateX(0) rotate(0deg); opacity: 1; }'
  },
  'tilt-in': {
    name: 'Tilt In',
    css: '0% { transform: rotateY(30deg) translateY(-100px) skewY(-30deg); opacity: 0; } 100% { transform: rotateY(0deg) translateY(0) skewY(0deg); opacity: 1; }'
  }
};

const GLASS_STYLES = [
  {
    id: 'original',
    name: 'Original (Default)',
    css: 'background: rgba(255, 255, 255, 0.14); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); border: 1px solid rgba(255, 255, 255, 0.15); box-shadow: none;'
  },
  {
    id: 'deep-frost',
    name: 'Deep Frost',
    css: 'background: rgba(18, 18, 24, 0.65); backdrop-filter: blur(16px) saturate(180%); -webkit-backdrop-filter: blur(16px) saturate(180%); border: 1px solid rgba(255, 255, 255, 0.1); box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.36);'
  },
  {
    id: 'classic',
    name: 'Classic Frost',
    css: 'background: rgba(255, 255, 255, 0.15); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); border: 1px solid rgba(255, 255, 255, 0.2); box-shadow: 0 4px 30px rgba(0, 0, 0, 0.1);'
  },
  {
    id: 'icy-white',
    name: 'Icy White (Opaque)',
    css: 'background: rgba(255, 255, 255, 0.25); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); border: 1px solid rgba(255, 255, 255, 0.4); box-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.15);'
  },
  {
    id: 'holographic',
    name: 'Holographic',
    css: 'background: linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0)); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border: 1px solid rgba(255, 255, 255, 0.18); box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);'
  },
  {
    id: 'soft-mist',
    name: 'Soft Mist (Minimal)',
    css: 'background: rgba(255, 255, 255, 0.05); backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); border: 1px solid rgba(255, 255, 255, 0.1); box-shadow: none;'
  },
  {
    id: 'obsidian',
    name: 'Obsidian (Dark Mode)',
    css: 'background: rgba(0, 0, 0, 0.5); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); border: 1px solid rgba(255, 255, 255, 0.05); box-shadow: 0 4px 6px rgba(0, 0, 0, 0.4);'
  },
  {
    id: 'neon',
    name: 'Neon Glass',
    css: 'background: rgba(40, 40, 40, 0.6); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); border: 1px solid rgba(44, 165, 255, 0.5); box-shadow: 0 0 15px rgba(44, 165, 255, 0.2);'
  },
  {
    id: 'grainy',
    name: 'Grainy (High Blur)',
    css: 'background: rgba(255, 255, 255, 0.1); backdrop-filter: blur(40px); -webkit-backdrop-filter: blur(40px); border: 1px solid rgba(255, 255, 255, 0.2); box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.1);'
  },
  {
    id: 'ceramic',
    name: 'Ceramic (Matte)',
    css: 'background: rgba(255, 255, 255, 0.1); backdrop-filter: blur(25px) brightness(1.2); -webkit-backdrop-filter: blur(25px) brightness(1.2); border: 1px solid rgba(255, 255, 255, 0.3); box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);'
  },
  {
    id: 'liquid',
    name: 'Liquid Water',
    css: 'background: rgba(255, 255, 255, 0.15); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); border-top: 1px solid rgba(255, 255, 255, 0.5); border-left: 1px solid rgba(255, 255, 255, 0.5); border-radius: 24px; box-shadow: 10px 10px 10px rgba(0, 0, 0, 0.1);'
  },
  /* --- NEW STYLES ADDED BELOW --- */
  {
    id: 'modern-glass',
    name: 'Modern Glass (Standard)',
    css: 'background: rgba(255, 255, 255, 0.2); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border: 1px solid rgba(255, 255, 255, 0.3); box-shadow: 0 4px 30px rgba(0, 0, 0, 0.1);'
  },
  {
    id: 'prism-light',
    name: 'Prism (Reflective)',
    css: 'background: linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0)); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border: 1px solid rgba(255, 255, 255, 0.18); box-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.37);'
  },
  {
    id: 'glacier-blue',
    name: 'Glacier (Blue Tint)',
    css: 'background: rgba(200, 225, 255, 0.15); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); border: 1px solid rgba(255, 255, 255, 0.25); box-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.15);'
  },
  {
    id: 'stealth-dark',
    name: 'Stealth (Matte Dark)',
    css: 'background: rgba(0, 0, 0, 0.7); backdrop-filter: blur(20px) saturate(180%); -webkit-backdrop-filter: blur(20px) saturate(180%); border: 1px solid rgba(255, 255, 255, 0.08); box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.5); color: #e2e8f0;'
  }
];

const WHATS_NEW = {
  version: '1.10.0',
  date: '2026-01-23',
  items: [
    {
      type: 'NEW',
      title: "What's New page in Settings",
      desc: 'See the latest release highlights with version and date details.'
    },
    {
      type: 'IMPROVED',
      title: 'Update cards with type badges',
      desc: 'Each entry is labeled and summarized for quicker scanning.'
    },
    {
      type: 'FIX',
      title: 'New badge clears after viewing',
      desc: 'The nav indicator hides once you open What\'s New.'
    }
  ]
};

const ICON_CATEGORIES = {
  'Essentials': ['home', 'star', 'heart', 'globe', 'flag', 'fire', 'bolt'],
  'Finance': ['bank', 'wallet', 'dollar', 'euro', 'bitcoin', 'piggy'],
  'Shopping': ['cart', 'bag', 'tag', 'store', 'gift'],
  'Gaming': ['gamepad', 'controller', 'pacman', 'dice', 'puzzle'],
  'Religion': ['cross', 'moon_star', 'star_david', 'om', 'yin_yang', 'peace'],
  'Moods': ['smile', 'sad', 'wink', 'cool', 'neutral'],
  'Nature': ['paw', 'dog', 'cat', 'bird', 'fish', 'leaf'],
  'Brands': ['apple', 'android', 'windows', 'chrome', 'google', 'twitter', 'facebook', 'instagram', 'youtube', 'amazon'],
  'Work': ['briefcase', 'mail', 'calendar', 'chart', 'document'],
  'Education': ['school', 'book', 'microscope', 'lightbulb'],
  'Media': ['play', 'music', 'game', 'image'],
  'Social': ['chat', 'group', 'user', 'phone'],
  'Travel': ['flight', 'map', 'car', 'camera'],
  'System': ['settings', 'lock', 'shield', 'trash', 'download']
};

const ICON_SYMBOL_CLASSES = {
  bookmarkFolderSmall: 'bookmark-folder-icon',
  bookmarkFolderLarge: 'bookmark-folder-icon',
  bookmarkTabsPlus: 'bookmark-tabs__plus-icon',
  historyClock: 'suggestion-icon',
  search: 'suggestion-icon',
  heartOutline: 'outline',
  heartFilled: 'filled',
  heartCelebrate: 'celebrate',
  binTop: 'bin-top',
  binBottom: 'bin-bottom',
  binGarbage: 'garbage',
};

// Helpers reused by new-tab.js
function useSvgIcon(name, className = '') {
  if (!name) return '';
  const classList = className || ICON_SYMBOL_CLASSES[name] || '';
  const classAttr = classList ? ` class="${classList}"` : '';
  return `<svg${classAttr} aria-hidden="true" focusable="false"><use href="#icon-${name}"></use></svg>`;
}

function tintSvgElement(svg, color) {
  if (!svg || !color) return;
  svg.style.fill = color;
  svg.style.color = color;
  svg.style.setProperty('fill', color, 'important');
}

// Skip redundant DOM writes for frequent UI updates
function setText(el, value) {
  if (!el) return;
  const next = value == null ? '' : String(value);
  if (el.textContent !== next) el.textContent = next;
}

function setAttr(el, name, value) {
  if (!el) return;
  const next = value == null ? '' : String(value);
  if (el.getAttribute(name) !== next) el.setAttribute(name, next);
}

function isLightColor(hex, alpha = 1) {
  const clean = (hex || '').replace('#', '');
  if (clean.length !== 6) return false;
  const rgb = parseInt(clean, 16);
  if (Number.isNaN(rgb)) return false;
  const r = (rgb >> 16) & 0xff;
  const g = (rgb >> 8) & 0xff;
  const b = rgb & 0xff;

  const clampedAlpha = Math.max(0, Math.min(1, Number(alpha)));
  const blendedR = r * clampedAlpha + 255 * (1 - clampedAlpha);
  const blendedG = g * clampedAlpha + 255 * (1 - clampedAlpha);
  const blendedB = b * clampedAlpha + 255 * (1 - clampedAlpha);

  const luma = 0.2126 * blendedR + 0.7152 * blendedG + 0.0722 * blendedB;
  return luma > 150;
}

function hslToRgb(h, s, l) {
  let r, g, b;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h;
  let s;
  const l = (max + min) / 2;

  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }

  return [h * 360, s, l];
}

function getComplementaryColor(hex) {
  const clean = (hex || '#ffffff').replace(/^#/, '').toLowerCase();
  if (clean.length !== 6) return '#000000';

  if (clean === 'ffffff') {
    return '#94a3b8';
  }

  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  if ([r, g, b].some((v) => Number.isNaN(v))) return '#000000';

  const luma = (0.299 * r) + (0.587 * g) + (0.114 * b);
  const isBgLight = luma > 140;

  const [hOrig] = rgbToHsl(r, g, b);

  const hComp = (hOrig + 180) % 360;
  const sFinal = 0.25;
  const lFinal = isBgLight ? 0.25 : 0.85;

  const [finalR, finalG, finalB] = hslToRgb(hComp / 360, sFinal, lFinal);

  const toHex = (n) => {
    const clamped = Math.min(255, Math.max(0, Math.round(n)));
    return clamped.toString(16).padStart(2, '0');
  };

  return `#${toHex(finalR)}${toHex(finalG)}${toHex(finalB)}`;
}
