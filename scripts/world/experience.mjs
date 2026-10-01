import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';
import { chapters, references, clamp } from './spec.mjs';

const host = document.getElementById('scrollWorld');
if (host) boot();

function boot() {
  gsap.registerPlugin(ScrollTrigger);
  const viewport = document.getElementById('worldViewport');
  const sections = chapters.map(chapter => document.getElementById(chapter.id));
  const interfaceElement = document.getElementById('worldInterface');
  const chapterLinks = [...interfaceElement.querySelectorAll('nav a')];
  const motionControl = document.getElementById('worldMotion');
  const lightControl = document.getElementById('worldLight');
  const selector = document.getElementById('worldArtworkSelector');
  const artworkImage = document.getElementById('worldArtworkImage');
  const artworkName = document.getElementById('worldArtworkName');
  const artworkLink = document.getElementById('worldArtworkLink');
  const artworkPrice = document.getElementById('worldArtworkPrice');
  const artworkStatus = document.getElementById('worldArtworkStatus');
  const photoFallback = document.getElementById('worldPhotoFallback');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  const cleanups = [], originals = new Map();
  let world, loader, lenis, context, ticker, disposed = false, loading = false, failed = false;
  let exact = 0, currentChapter = -1, visible = true, still = false, inspecting = false;
  let anchors = [], scrollFrame = 0, restoreFrame = 0, generation = 0;
  let artworks = references.map(item => ({...item})), selected = artworks[0], selection = 0, retryArtwork = null;
  const images = new Map();
  try { still = sessionStorage.getItem('alk-world-still') === 'true'; } catch {}
  const dataSaving = navigator.connection?.saveData || /(^|-)2g$/.test(navigator.connection?.effectiveType || '');
  const wantsMotion = () => !reduced.matches && !still && !dataSaving;
  const modalOpen = () => document.body.matches('.mobile-nav-open, .search-is-open, .filters-open');
  function on(target, type, listener, options) { target.addEventListener(type, listener, options); cleanups.push(() => target.removeEventListener(type, listener, options)); }

  function measure() {
    anchors = sections.map(section => section.getBoundingClientRect().top + window.scrollY);
    updateScroll(true); ScrollTrigger.refresh();
  }
  function updateScroll(immediate = false) {
    scrollFrame = 0;
    const y = window.scrollY;
    let index = 0;
    while (index < anchors.length - 2 && y >= anchors[index + 1]) index++;
    exact = clamp(index + (y - anchors[index]) / Math.max(1, anchors[index + 1] - anchors[index]), 0, 3);
    const chapter = Math.round(exact);
    if (chapter !== currentChapter) {
      currentChapter = chapter;
      host.dataset.chapter = chapters[chapter].id;
      chapterLinks.forEach((link, i) => i === chapter ? link.setAttribute('aria-current', 'step') : link.removeAttribute('aria-current'));
    }
    if ((exact < .65 || exact > 1.35) && inspecting) setInspect(false);
    world?.setProgress(exact, immediate);
    interfaceElement.hidden = y > anchors[3] + sections[3].offsetHeight - innerHeight + 24;
  }
  function queueScroll() { if (!scrollFrame) scrollFrame = requestAnimationFrame(() => updateScroll()); }
  function setInspect(value) {
    inspecting = value;
    lightControl.setAttribute('aria-pressed', String(value));
    lightControl.children[1].textContent = value ? 'Return to gallery light' : 'Explore the surface';
    world?.setInspect(value);
  }
  function syncActive() {
    const active = visible && !document.hidden && !modalOpen() && wantsMotion();
    world?.setActive(active);
    if (modalOpen() || document.hidden) { lenis?.stop(); world?.resetPointer(); }
    else lenis?.start();
  }
  function fallback() {
    host.dataset.worldState = 'poster';
    lightControl.hidden = true;
    setInspect(false);
  }
  function stopWorld() {
    ++generation; loader?.abort(); loader = null; loading = false;
    world?.dispose(); world = null; fallback();
  }
  async function startWorld() {
    if (world || loading || failed || !wantsMotion() || disposed) return;
    loading = true;
    const thisGeneration = ++generation;
    loader = new AbortController();
    const signal = loader.signal;
    try {
      const {createWorld} = await import('./renderer.mjs');
      if (signal.aborted || disposed) return;
      const nextWorld = await createWorld(viewport, {
        signal,
        onFailure() { failed = true; stopWorld(); motionControl.textContent = 'Still view'; motionControl.disabled = true; },
        onActivate(name) {
          if (name === 'inspect') setInspect(!inspecting);
          else if (name === 'artwork') artworkLink.click();
        },
        onReady() {},
      });
      if (thisGeneration !== generation || signal.aborted || disposed) { nextWorld.dispose(); return; }
      world = nextWorld; world.setProgress(exact, true);
      try { await world.setPhoto(selected.image); photoFallback.dataset.failed = 'false'; }
      catch { photoFallback.dataset.failed = 'true'; }
      if (thisGeneration !== generation || disposed) return;
      host.dataset.worldState = 'ready'; lightControl.hidden = false;
      syncActive();
    } catch (error) {
      if (error.name !== 'AbortError' && thisGeneration === generation && !disposed) { failed = true; fallback(); }
    } finally { if (thisGeneration === generation) loading = false; }
  }
  function splitHeading(element) {
    originals.set(element, {html: element.innerHTML, label: element.getAttribute('aria-label')});
    element.setAttribute('aria-label', element.textContent.replace(/\s+/g, ' ').trim());
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT), nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(node => {
      const fragment = document.createDocumentFragment();
      node.textContent.split(/(\s+)/).forEach(word => {
        if (!word.trim()) { fragment.append(document.createTextNode(word)); return; }
        const mask = document.createElement('span'), inner = document.createElement('span');
        mask.className = 'world-word-mask'; mask.setAttribute('aria-hidden', 'true');
        inner.className = 'world-word'; inner.textContent = word; mask.append(inner); fragment.append(mask);
      });
      node.replaceWith(fragment);
    });
  }
  function stopMotion() {
    if (ticker) gsap.ticker.remove(ticker);
    ticker = null; lenis?.destroy(); lenis = null; context?.revert(); context = null;
    originals.forEach(({html, label}, element) => { element.innerHTML = html; if (label === null) element.removeAttribute('aria-label'); else element.setAttribute('aria-label', label); });
    originals.clear(); stopWorld();
  }
  function startMotion() {
    if (!wantsMotion() || lenis || disposed) return;
    lenis = new Lenis({lerp: .09, smoothWheel: true, syncTouch: false, anchors: false, autoRaf: false, prevent: node => !!node.closest?.('.nav-menu-overlay, .search-modal, .mobile-menu')});
    lenis.on('scroll', ScrollTrigger.update);
    ticker = time => lenis?.raf(time * 1000); gsap.ticker.add(ticker); gsap.ticker.lagSmoothing(0);
    context = gsap.context(() => {
      let played = false;
      try { played = sessionStorage.getItem('alk-world-entered') === 'true'; sessionStorage.setItem('alk-world-entered', 'true'); } catch {}
      // The primary message, nav and CTA are always readable during this one-shot settle.
      if (!played && scrollY < 100) {
        gsap.timeline({defaults: {ease: 'power3.out'}})
          .from('.world-arrival h1 > *', {y: 28, opacity: .55, duration: 1, stagger: .08}, 0)
          .from('.world-arrival .world-description', {y: 12, opacity: .6, duration: .85}, .18)
          .from('.world-arrival .world-primary', {y: 8, opacity: .8, duration: .8}, .28);
      }
      host.querySelectorAll('[data-world-reveal]').forEach(element => {
        splitHeading(element);
        gsap.from(element.querySelectorAll('.world-word'), {yPercent: 105, opacity: 0, duration: .85, stagger: .05, ease: 'power4.out', scrollTrigger: {trigger: element, start: 'top 90%', once: true}});
      });
    }, host);
    startWorld(); syncActive();
  }
  function syncMode() {
    const disabled = reduced.matches || dataSaving;
    motionControl.disabled = disabled;
    motionControl.textContent = wantsMotion() ? 'Still view' : 'Explore in motion';
    motionControl.setAttribute('aria-pressed', String(!wantsMotion()));
    motionControl.hidden = disabled;
    if (wantsMotion()) { failed = false; startMotion(); } else stopMotion();
    measure();
  }

  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  function updateProduct() {
    const products = window.getProducts?.() || [];
    const matches = selected.productId ? products.filter(product => Number(product.id) === Number(selected.productId)) : selected.match ? products.filter(product => normalize(product.brand).trim() === 'alkebulan' && selected.match.test(normalize(product.name))) : [];
    const product = matches.length === 1 ? matches[0] : null;
    artworkName.textContent = selected.title;
    artworkLink.href = product ? `product.html?id=${encodeURIComponent(product.id)}` : 'shop.html';
    artworkLink.setAttribute('aria-label', product ? `View ${product.name}${product.inStock === false ? ' — sold out' : ''}` : `Explore ${selected.title} in the collection`);
    const money = product && window.LuxeMoney?.forProduct?.(product);
    artworkPrice.textContent = money ? [money.ngn, money.usd].filter(Boolean).join(' / ') : '';
    artworkPrice.hidden = !artworkPrice.textContent;
  }
  function prepareImage(url) {
    if (!images.has(url)) images.set(url, new Promise((resolve, reject) => {
      const image = new Image(); image.onload = () => resolve(image); image.onerror = () => {images.delete(url); reject(new Error('Image unavailable'));}; image.src = url;
    }));
    return images.get(url);
  }
  async function choose(item, {replace = false} = {}) {
    if (!item) return;
    const request = ++selection;
    [...selector.children].forEach(button => button.setAttribute('aria-busy', String(button.dataset.worldArtwork === item.id)));
    artworkStatus.textContent = 'Loading artwork…';
    try {
      await prepareImage(item.image);
      if (request !== selection || disposed) return;
      let textureFailed = false;
      if (world) await world.setPhoto(item.image).catch(() => {textureFailed = true;});
      if (request !== selection || disposed) return;
      selected = item; artworkImage.src = item.image; artworkImage.alt = item.alt;
      photoFallback.dataset.failed = String(textureFailed);
      [...selector.children].forEach(button => button.setAttribute('aria-pressed', String(button.dataset.worldArtwork === item.id)));
      updateProduct(); artworkStatus.textContent = ''; retryArtwork = null;
    } catch {
      if (request === selection) {
        retryArtwork = item;
        if (replace) {
          selected = item; artworkImage.src = 'assets/brand/product-placeholder.svg';
          artworkImage.alt = `${item.title} — image unavailable`; photoFallback.dataset.failed = 'true';
          [...selector.children].forEach(button => button.setAttribute('aria-pressed', String(button.dataset.worldArtwork === item.id)));
          updateProduct();
        }
        artworkStatus.textContent = `${item.title} is unavailable. Please choose another artwork.`;
      }
    } finally {
      if (request === selection) [...selector.children].forEach(button => button.removeAttribute('aria-busy'));
    }
  }
  function syncContent(content) {
    if (!content?.slides?.length) return;
    const next = content.slides.map(slide => ({...slide, image: window.LuxeSiteContent?.imageUrl(slide.image) || slide.image, match: references.find(item => item.image === slide.image)?.match}));
    if (JSON.stringify(next) === JSON.stringify(artworks)) return;
    artworks = next;
    selector.replaceChildren(...artworks.map(item => {
      const button = document.createElement('button'); button.type = 'button'; button.dataset.worldArtwork = item.id;
      button.textContent = item.title; button.setAttribute('aria-pressed', String(item.id === selected.id)); return button;
    }));
    choose(artworks[0], {replace: true});
  }
  selector.hidden = false;
  on(selector, 'click', event => { const button = event.target.closest('[data-world-artwork]'); if (button) choose(artworks.find(item => item.id === button.dataset.worldArtwork)); });
  on(selector, 'keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const buttons = [...selector.children], i = buttons.indexOf(event.target);
    if (i < 0) return;
    event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (i + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next].focus({preventScroll: true}); buttons[next].click();
  });
  on(motionControl, 'click', () => { still = !still; try {sessionStorage.setItem('alk-world-still', String(still));} catch {} syncMode(); });
  on(lightControl, 'click', () => setInspect(!inspecting));
  on(lightControl, 'focus', () => world?.setFocused(true));
  on(lightControl, 'blur', () => world?.setFocused(false));
  on(host, 'pointermove', event => {
    if (!fine.matches || event.pointerType !== 'mouse' || modalOpen() || event.target.closest('a,button')) return;
    const rect = viewport.getBoundingClientRect();
    world?.pointer((event.clientX - rect.left) / rect.width * 2 - 1, (event.clientY - rect.top) / rect.height * 2 - 1);
  }, {passive: true});
  on(host, 'pointerleave', () => world?.resetPointer());
  on(host, 'click', event => {
    if (event.target.closest('a,button') || !fine.matches || modalOpen()) return;
    const rect = viewport.getBoundingClientRect(); world?.activate((event.clientX - rect.left) / rect.width * 2 - 1, (event.clientY - rect.top) / rect.height * 2 - 1);
  });
  on(host, 'click', event => {
    const link = event.target.closest('a[href^="#"]');
    if (!link || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const destination = document.getElementById(link.hash.slice(1)); if (!destination) return;
    event.preventDefault(); event.stopImmediatePropagation();
    history.pushState(null, '', link.hash);
    destination.setAttribute('tabindex', '-1');
    const complete = () => { destination.focus({preventScroll: true}); updateScroll(true); };
    if (lenis) lenis.scrollTo(destination, {duration: 1.3, onComplete: complete});
    else {destination.scrollIntoView({behavior: 'instant'}); complete();}
  }, true);
  on(window, 'scroll', queueScroll, {passive: true});
  on(window, 'resize', measure, {passive: true});
  on(window, 'blur', () => world?.resetPointer());
  on(window, 'hashchange', () => updateScroll(true));
  on(window, 'popstate', () => { restoreFrame = requestAnimationFrame(() => updateScroll(true)); });
  on(document, 'visibilitychange', syncActive);
  on(reduced, 'change', syncMode);
  on(fine, 'change', () => world?.resetPointer());
  on(window, 'luxe:site-content', event => syncContent(event.detail));
  on(window, 'luxe:catalog-status', updateProduct);
  on(window, 'online', () => choose(retryArtwork || selected));
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; syncActive(); }, {threshold: 0});
    observer.observe(host); cleanups.push(() => observer.disconnect());
  }
  if ('ResizeObserver' in window) {
    const layoutObserver = new ResizeObserver(measure); sections.forEach(section => layoutObserver.observe(section)); cleanups.push(() => layoutObserver.disconnect());
  }
  const modalObserver = new MutationObserver(syncActive); modalObserver.observe(document.body, {attributes: true, attributeFilter: ['class']}); cleanups.push(() => modalObserver.disconnect());
  on(window, 'pagehide', event => { if (event.persisted) {world?.setActive(false); lenis?.stop();} else dispose(); });
  on(window, 'pageshow', () => { measure(); syncActive(); });
  function dispose() {
    if (disposed) return; disposed = true; ++selection;
    cancelAnimationFrame(scrollFrame); cancelAnimationFrame(restoreFrame); stopMotion(); cleanups.forEach(fn => fn());
    interfaceElement.hidden = true;
  }
  interfaceElement.hidden = false;
  measure(); syncMode();
  document.fonts.ready.then(() => {if (!disposed) measure();});
  Promise.resolve(window.productsReady).then(updateProduct).catch(updateProduct);
  if (window.LuxeSiteContent) syncContent(window.LuxeSiteContent.snapshot().content);
  // Opt-in local instrumentation; absent from the public interface.
  if (new URLSearchParams(location.search).has('world-debug')) window.__alkWorld = {
    stats: () => world?.stats() || {exact, state: host.dataset.worldState, loading, failed},
    capture: () => world?.capture(),
    dispose,
  };
}
