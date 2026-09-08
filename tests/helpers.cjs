const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');

function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
    key: index => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  };
}

function browserContext(overrides = {}) {
  const listeners = new Map();
  const context = vm.createContext({
    console: { log() {}, warn() {}, error() {} }, URL, URLSearchParams,
    setTimeout, clearTimeout, crypto: globalThis.crypto,
    localStorage: storage(), sessionStorage: storage(),
    location: { href: 'https://store.example/shop.html', pathname: '/shop.html', search: '' },
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    addEventListener() {}, dispatchEvent() {},
    document: {
      readyState: 'loading',
      addEventListener(name, fn) { if (!listeners.has(name)) listeners.set(name, []); listeners.get(name).push(fn); },
      querySelectorAll: () => [], querySelector: () => null, getElementById: () => null,
    },
    ...overrides,
  });
  context.window = context;
  return { context, listeners, run(file) { return vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file }); } };
}
module.exports = { root, storage, browserContext };
