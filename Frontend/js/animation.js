// Progressive motion: normal document styles always leave content visible.
(function initializeSubtleMotion() {
    'use strict';
    const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const active = new Map();
    const waiting = new Set();
    const registered = new WeakSet();
    const selectors = [
        '.opening-copy > *', '.collection-heading', '.collection-card',
        '.detail-image', '.detail-copy', '.category-hero-content > *',
        '.about-hero-content > *', '.page-header h1', '.support-hero h1',
        '.category-card', '.feature', '.review-card', '.about-card', '.value-card',
        '.stat-item', '.section-heading-row', '.house-story-copy', '.newsletter-box',
        '.support-card', '.product-grid > .product-card:not(.product-card-skeleton)',
        '.wishlist-grid > .wishlist-item',
    ].join(', ');
    let observer;
    let scheduled = 0;
    const additions = new Set();

    function enabled() {
        return !preference?.matches && !document.hidden && !navigator.connection?.saveData;
    }
    function cancel(element) {
        active.get(element)?.cancel();
        active.delete(element);
    }
    function settle() {
        active.forEach(animation => animation.cancel());
        active.clear();
    }
    function enter(element, { delay = 0, duration = 420, distance = 8 } = {}) {
        if (!element?.animate || !enabled() || !element.isConnected || !element.getClientRects().length
            || element.closest('[hidden], [inert], [aria-hidden="true"]') || element.contains(document.activeElement)) return;
        cancel(element);
        const base = getComputedStyle(element);
        const transform = base.transform === 'none' ? '' : base.transform;
        const opacity = Number(base.opacity);
        if (!opacity) return;
        try {
            const animation = element.animate([
                { opacity: opacity * .72, transform: ('translate3d(0, ' + distance + 'px, 0) ' + transform).trim() },
                { opacity, transform: transform || 'none' },
            ], { duration, delay: Math.min(105, delay), easing: 'cubic-bezier(.2,.7,.2,1)' });
            active.set(element, animation);
            const cleanup = () => { if (active.get(element) === animation) active.delete(element); };
            animation.addEventListener('finish', cleanup, { once: true });
            animation.addEventListener('cancel', cleanup, { once: true });
        } catch { /* Animations are optional; the normal styles remain usable. */ }
    }
    function refresh(root = document) {
        const elements = [...(root.matches?.(selectors) ? [root] : []), ...root.querySelectorAll(selectors)];
        elements.forEach(element => {
            if (registered.has(element)) return;
            registered.add(element);
            if (observer && enabled()) {
                waiting.add(element);
                observer.observe(element);
            }
        });
    }
    function init() {
        if ('IntersectionObserver' in window) {
            try {
                observer = new IntersectionObserver(entries => {
                    let order = 0;
                    entries.forEach(entry => {
                        if (!entry.isIntersecting) return;
                        observer.unobserve(entry.target);
                        waiting.delete(entry.target);
                        if (order < 16) enter(entry.target, { delay: (order++ % 4) * 35 });
                    });
                }, { threshold: .05 });
            } catch { /* Keep the complete page visible if observation fails. */ }
        }
        refresh();
        if ('MutationObserver' in window) {
            new MutationObserver(records => {
                if (records.some(record => record.removedNodes.length)) {
                    waiting.forEach(element => {
                        if (element.isConnected) return;
                        observer?.unobserve(element);
                        waiting.delete(element);
                    });
                    active.forEach((animation, element) => { if (!element.isConnected) cancel(element); });
                }
                records.forEach(record => record.addedNodes.forEach(node => {
                    if (node instanceof Element) additions.add(node);
                }));
                if (!additions.size || scheduled) return;
                scheduled = requestAnimationFrame(() => {
                    scheduled = 0;
                    additions.forEach(node => { if (node.isConnected) refresh(node); });
                    additions.clear();
                });
            }).observe(document.body, { childList: true, subtree: true });
        }
        document.addEventListener('focusin', event => {
            active.forEach((animation, element) => { if (element.contains(event.target)) cancel(element); });
        });
        document.addEventListener('visibilitychange', () => { if (document.hidden) settle(); });
        preference?.addEventListener('change', () => { if (preference.matches) settle(); });
        window.addEventListener('pagehide', settle);
        window.addEventListener('pageshow', event => { if (event.persisted) settle(); });
    }
    window.LuxeMotion = { enter, refresh };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})();
