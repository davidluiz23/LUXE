/* Optional enhancement: the artwork and shopping UI exist before WebGL loads. */
(() => {
  'use strict';
  const host = document.querySelector('[data-heritage-scene]');
  if (!host) return;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const button = host.querySelector('.heritage-playback');
  const status = host.querySelector('.heritage-status');
  const script = document.currentScript;
  const moduleURL = new URL('heritage/renderer.js?v=20260920-2', script.src).href;
  let scene, pending, near = false, visible = false, paused = false, failed = false;
  let pageHidden = false, destroyed = false;
  const connection = navigator.connection;
  const saveData = connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType || '');
  function sync() {
    const active = visible && !document.hidden && !pageHidden && !destroyed && !motion.matches && !paused && !failed;
    scene?.setActive(active);
    host.dataset.playing = String(!!scene && active && !failed);
    button.hidden = !scene || failed || motion.matches;
    button.setAttribute('aria-pressed', String(paused));
    button.setAttribute('aria-label', paused ? 'Play sculpture' : 'Pause sculpture');
    button.querySelector('.heritage-playback-label').textContent = paused ? 'Play' : 'Pause';
    button.firstElementChild.textContent = paused ? '▷' : 'Ⅱ';
    if (scene && !failed) {
      host.dataset.state = motion.matches ? 'poster' : 'ready';
      status.textContent = motion.matches ? 'Contemporary digital sculpture' : 'Light, clay and movement';
    }
  }
  function fallback() {
    failed = true;
    scene?.dispose();
    scene = null;
    host.dataset.state = 'fallback';
    status.textContent = 'Still view of the sculpture';
    sync();
  }
  async function load() {
    if (pending || scene || failed || destroyed || pageHidden || document.hidden || !near || motion.matches || saveData) return;
    host.dataset.state = 'loading';
    status.textContent = 'Preparing the moving study…';
    pending = true;
    try {
      const { createHeritageScene } = await import(moduleURL);
      if (destroyed || failed) return;
      const loadedScene = await createHeritageScene(host.querySelector('.heritage-viewport'), {
        modelURL: new URL('assets/heritage/terracotta-study.glb?v=2', document.baseURI).href,
        onFailure: fallback,
      });
      if (destroyed || failed) { loadedScene.dispose(); return; }
      scene = loadedScene;
      sync();
    } catch (_) { fallback(); }
    finally { pending = false; }
  }
  button.addEventListener('click', () => { paused = !paused; sync(); });
  document.addEventListener('visibilitychange', () => { sync(); if (!document.hidden) load(); });
  motion.addEventListener('change', () => { sync(); load(); });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      near = entries[0].isIntersecting;
      if (near) load();
    }, {rootMargin: '280px'}).observe(host);
    new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting;
      sync();
    }, {threshold: .08}).observe(host);
  }
  // Without observers, keep the still view rather than running offscreen work.
  window.addEventListener('pagehide', event => {
    pageHidden = true;
    scene?.setActive(false);
    if (!event.persisted) { destroyed = true; scene?.dispose(); scene = null; }
  });
  window.addEventListener('pageshow', () => { pageHidden = false; sync(); load(); });
})();
