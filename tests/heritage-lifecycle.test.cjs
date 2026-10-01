const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../Frontend/js/heritage-scene.js'), 'utf8')
  .replace('await import(moduleURL)', 'await window.__importHeritage()');
const flush = () => new Promise(resolve => setImmediate(resolve));

function setup() {
  const button = new EventTarget();
  button.firstElementChild = {textContent: ''};
  button.setAttribute = () => {};
  button.querySelector = () => ({textContent: ''});
  const status = {textContent: ''};
  const host = {dataset: {}, querySelector: selector => selector === '.heritage-playback' ? button : selector === '.heritage-status' ? status : {}};
  const document = Object.assign(new EventTarget(), {
    hidden: false,
    baseURI: 'https://example.test/',
    currentScript: {src: 'https://example.test/js/heritage-scene.js'},
    querySelector: () => host,
  });
  const motion = Object.assign(new EventTarget(), {matches: false});
  const observers = [];
  const window = new EventTarget();
  let complete, onFailure, loads = 0, disposed = 0;
  const activity = [];
  window.__importHeritage = async () => ({
    createHeritageScene: (_viewport, options) => {
      loads++;
      onFailure = options.onFailure;
      return new Promise(resolve => {
        complete = () => resolve({setActive: value => activity.push(value), dispose: () => disposed++});
      });
    },
  });
  class IntersectionObserver {
    constructor(callback) { observers.push(callback); }
    observe() {}
  }
  window.IntersectionObserver = IntersectionObserver;
  vm.runInNewContext(source, {window, document, navigator: {}, matchMedia: () => motion, IntersectionObserver, URL});
  return {
    window, document, motion, host, activity,
    show() { observers.forEach(callback => callback([{isIntersecting: true}])); },
    complete() { complete(); },
    fail() { onFailure(); },
    get loads() { return loads; },
    get disposed() { return disposed; },
  };
}

test('heritage initialization failure disposes a late scene and never starts its RAF', async () => {
  const state = setup();
  state.show();
  await flush();
  state.fail();
  state.complete();
  await flush();
  assert.equal(state.host.dataset.state, 'fallback');
  assert.equal(state.disposed, 1);
  assert.equal(state.activity.includes(true), false);
});

test('heritage unload disposes an asynchronously completed scene', async () => {
  const state = setup();
  state.show();
  await flush();
  const event = new Event('pagehide');
  event.persisted = false;
  state.window.dispatchEvent(event);
  state.complete();
  await flush();
  assert.equal(state.disposed, 1);
  assert.equal(state.activity.includes(true), false);
});

test('heritage defers hidden-tab loading and keeps a cached page paused until pageshow', async () => {
  const state = setup();
  state.document.hidden = true;
  state.show();
  await flush();
  assert.equal(state.loads, 0);
  state.document.hidden = false;
  state.document.dispatchEvent(new Event('visibilitychange'));
  await flush();
  assert.equal(state.loads, 1);
  state.complete();
  await flush();
  assert.equal(state.activity.at(-1), true);
  const event = new Event('pagehide');
  event.persisted = true;
  state.window.dispatchEvent(event);
  assert.equal(state.activity.at(-1), false);
  state.motion.dispatchEvent(new Event('change'));
  assert.equal(state.activity.at(-1), false);
  state.window.dispatchEvent(new Event('pageshow'));
  assert.equal(state.activity.at(-1), true);
  assert.equal(state.disposed, 0);
});
