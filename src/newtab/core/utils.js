function debounce(func, wait) {
  let timeout = null;
  let lastArgs;
  let lastThis;

  function debounced(...args) {
    lastArgs = args;
    lastThis = this;

    if (timeout) clearTimeout(timeout);

    timeout = setTimeout(() => {
      timeout = null;
      func.apply(lastThis, lastArgs);
    }, wait);
  }

  debounced.cancel = () => {
    if (timeout) clearTimeout(timeout);
    timeout = null;
    lastArgs = null;
    lastThis = null;
  };

  debounced.flush = () => {
    if (!timeout) return;
    clearTimeout(timeout);
    const args = lastArgs;
    const ctx = lastThis;
    timeout = null;
    lastArgs = null;
    lastThis = null;
    func.apply(ctx, args);
  };

  return debounced;
}

function shuffleArray(arr) {

  for (let i = arr.length - 1; i > 0; i--) {

    const j = Math.floor(Math.random() * (i + 1));

    [arr[i], arr[j]] = [arr[j], arr[i]];

  }

  return arr;

}

// Run async work with limited concurrency while preserving order.
async function mapLimit(items, limit, worker) {

  const results = [];

  const list = Array.isArray(items) ? items : [];

  const max = Math.max(1, limit || 1);

  let index = 0;
  let active = 0;

  return new Promise((resolve) => {

    const next = () => {

      if (index >= list.length && active === 0) {

        resolve(results);

        return;

      }

      while (active < max && index < list.length) {

        const current = index++;

        active++;

        Promise.resolve()
          .then(() => worker(list[current], current))
          .then((res) => {

            results[current] = res;

          })
          .catch((err) => {

            results[current] = err instanceof Error ? err : new Error(String(err));

          })
          .finally(() => {

            active--;

            next();

          });

      }

    };

    next();

  });

}

function blobToDataUrl(blob) {

  return new Promise((resolve) => {

    try {

      const reader = new FileReader();

      reader.onload = (e) => resolve(e && e.target && e.target.result ? e.target.result : '');

      reader.onerror = () => resolve('');

      reader.readAsDataURL(blob);

    } catch (err) {

      resolve('');

    }

  });

}

function runAfterNextPaint(callback) {
  if (typeof callback !== 'function') return;

  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => requestAnimationFrame(callback));
  } else {
    setTimeout(callback, 0);
  }
}

function escapeHtml(unsafe) {

  if (!unsafe) return '';

  return String(unsafe)

    .replace(/&/g, '&amp;')

    .replace(/</g, '&lt;')

    .replace(/>/g, '&gt;')

    .replace(/"/g, '&quot;')

    .replace(/'/g, '&#039;');

}

function throttle(fn, limit) {
  let inThrottle = false;
  return function throttled(...args) {
    if (inThrottle) return;
    fn.apply(this, args);
    inThrottle = true;
    setTimeout(() => { inThrottle = false; }, limit);
  };
}

const CANONICAL_DEFAULT_WIDGET_ORDER = Object.freeze(['weather', 'quote', 'todo', 'news']);
const CANONICAL_WIDGET_ORDER_SET = new Set(CANONICAL_DEFAULT_WIDGET_ORDER);

function normalizeWidgetOrder(order) {
  const defaultOrder = (typeof window !== 'undefined' && window.DEFAULT_WIDGET_ORDER) || CANONICAL_DEFAULT_WIDGET_ORDER;
  const orderSet = (typeof window !== 'undefined' && window.WIDGET_ORDER_SET) || CANONICAL_WIDGET_ORDER_SET;
  const normalized = [];
  const seen = new Set();

  if (Array.isArray(order)) {
    order.forEach((value) => {
      if (typeof value !== 'string') return;
      const key = value.trim();
      if (!orderSet.has(key) || seen.has(key)) return;
      seen.add(key);
      normalized.push(key);
    });
  }

  defaultOrder.forEach((key) => {
    if (seen.has(key)) return;
    seen.add(key);
    normalized.push(key);
  });

  return normalized;
}

function areWidgetOrdersEqual(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) return false;
  }
  return true;
}

if (typeof window !== 'undefined') {
  window.DEFAULT_WIDGET_ORDER = window.DEFAULT_WIDGET_ORDER || CANONICAL_DEFAULT_WIDGET_ORDER;
  window.WIDGET_ORDER_SET = window.WIDGET_ORDER_SET || CANONICAL_WIDGET_ORDER_SET;
  window.normalizeWidgetOrder = normalizeWidgetOrder;
  window.areWidgetOrdersEqual = areWidgetOrdersEqual;
}
