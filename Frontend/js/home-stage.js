// Presentation only: reference photography never creates or changes catalog data.
(function initializeArtworkStage() {
    'use strict';
    const artwork = [
        { key: 'ijele', name: 'Ijele', image: 'assets/products/ijele.jpg', match: /\bijele\b/, alt: 'Black Ijele tee with warm lettering and intricate expressive artwork' },
        { key: 'durbar', name: 'Durbar', image: 'assets/products/durbar.jpg', match: /\bdurbar\b/, alt: 'Black tee with gold Durbar lettering and a mounted figure print' },
        { key: 'dun-dun', name: 'Dùn Dùn', image: 'assets/products/dun-dun.jpg', match: /\bdun[\s-]+dun\b/, alt: 'Black Dùn Dùn tee with yellow lettering and a print of three drummers' },
    ];
    const normalize = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

    function init() {
        const stage = document.getElementById('productStage');
        if (!stage) return;
        const image = document.getElementById('stageImage');
        const name = document.getElementById('stageName');
        const price = document.getElementById('stagePrice');
        const link = document.getElementById('stageLink');
        const selectors = [...document.querySelectorAll('[data-artwork]')];
        const collectionLinks = [...document.querySelectorAll('[data-collection-artwork]')];
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
        const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
        let selected = artwork[0];
        let selectionRequest = 0;
        let visible = true;
        let frame = 0;
        let pointerX = 0;
        let pointerY = 0;
        const prepared = new Map();

        function products() { return window.getProducts?.() || []; }
        function matchingProduct(item) {
            // Ambiguous matches intentionally remain editorial previews.
            const matches = products().filter(product => normalize(product.brand).trim() === 'alkebulan' && item.match.test(normalize(product.name)));
            return matches.length === 1 ? matches[0] : null;
        }
        function productUrl(product) { return `product.html?id=${encodeURIComponent(product.id)}`; }
        function updateDetails(item) {
            const product = matchingProduct(item);
            name.textContent = item.name;
            const money = product && window.LuxeMoney?.forProduct?.(product);
            price.textContent = money ? [money.ngn, money.usd].filter(Boolean).join(' / ') : '';
            price.hidden = !price.textContent;
            link.href = product ? productUrl(product) : 'shop.html';
            link.setAttribute('aria-label', product ? `View ${product.name}${product.inStock === false ? ' — sold out' : ''}` : `Explore ${item.name} in the collection`);
            const detailProduct = matchingProduct(artwork[1]);
            const detailLink = document.getElementById('detailLink');
            if (detailLink) {
                detailLink.href = detailProduct ? productUrl(detailProduct) : 'shop.html';
                detailLink.setAttribute('aria-label', detailProduct ? `Explore Durbar — ${detailProduct.name}` : 'Explore Durbar in the collection');
            }
        }
        function updateCollectionLinks() {
            collectionLinks.forEach(anchor => {
                const item = artwork.find(item => item.key === anchor.dataset.collectionArtwork);
                if (!item) return;
                const product = matchingProduct(item);
                anchor.href = product ? productUrl(product) : 'shop.html';
                anchor.setAttribute('aria-label', product ? `View ${product.name}${product.inStock === false ? ' — sold out' : ''}` : `Explore ${item.name} in the collection`);
            });
        }
        function prepare(item) {
            if (!prepared.has(item.key)) {
                prepared.set(item.key, new Promise(resolve => {
                    const next = new Image();
                    next.onload = () => resolve(true);
                    next.onerror = () => { prepared.delete(item.key); resolve(false); };
                    next.src = item.image;
                }));
            }
            return prepared.get(item.key);
        }
        async function select(item) {
            const request = ++selectionRequest;
            if (!(await prepare(item)) || request !== selectionRequest) return;
            selected = item;
            stage.dataset.featuredArtwork = item.key;
            image.src = item.image;
            image.alt = item.alt;
            document.getElementById('stageNumber').textContent = `0${artwork.indexOf(item) + 1} / 03`;
            selectors.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.artwork === item.key)));
            updateDetails(item);
            if (!reduced.matches && image.animate) {
                image.getAnimations().forEach(animation => animation.cancel());
                image.animate([{ opacity: .65 }, { opacity: 1 }], { duration: 360, easing: 'ease-out' });
            }
        }
        selectors.forEach(button => {
            button.addEventListener('click', () => select(artwork.find(item => item.key === button.dataset.artwork)));
            // Native Tab/Enter/Space remain available; arrows make comparisons easy.
            button.addEventListener('keydown', event => {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                event.preventDefault();
                const current = selectors.indexOf(button);
                const next = event.key === 'Home' ? 0 : event.key === 'End' ? selectors.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + selectors.length) % selectors.length;
                selectors[next].focus({ preventScroll: true });
                selectors[next].click();
            });
        });

        function resetDepth() {
            pointerX = pointerY = 0;
            stage.style.removeProperty('--depth-x');
            stage.style.removeProperty('--depth-y');
            stage.style.removeProperty('--depth-scroll');
        }
        function renderDepth() {
            frame = 0;
            if (reduced.matches || !visible || document.hidden) return;
            stage.style.setProperty('--depth-x', `${pointerY.toFixed(2)}deg`);
            stage.style.setProperty('--depth-y', `${pointerX.toFixed(2)}deg`);
            // A bounded shift; the section always follows native page scrolling.
            const shift = Math.min(12, Math.max(0, -stage.getBoundingClientRect().top * .035));
            stage.style.setProperty('--depth-scroll', `${shift.toFixed(2)}px`);
        }
        function scheduleDepth() {
            if (!frame && !reduced.matches && visible && !document.hidden) frame = requestAnimationFrame(renderDepth);
        }
        stage.addEventListener('pointermove', event => {
            if (!finePointer.matches || reduced.matches) return;
            const rect = stage.getBoundingClientRect();
            pointerX = ((event.clientX - rect.left) / rect.width - .5) * 6;
            pointerY = -((event.clientY - rect.top) / rect.height - .5) * 5;
            scheduleDepth();
        });
        stage.addEventListener('pointerleave', () => { pointerX = pointerY = 0; scheduleDepth(); });
        window.addEventListener('scroll', scheduleDepth, { passive: true });
        reduced.addEventListener('change', () => {
            if (frame) cancelAnimationFrame(frame);
            frame = 0;
            image.getAnimations?.().forEach(animation => animation.cancel());
            resetDepth();
        });
        finePointer.addEventListener('change', resetDepth);
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                if (frame) cancelAnimationFrame(frame);
                frame = 0;
            } else scheduleDepth();
        });
        if ('IntersectionObserver' in window) {
            new IntersectionObserver(entries => {
                visible = entries[0].isIntersecting;
                if (visible) scheduleDepth();
            }).observe(stage);
        }

        async function syncCatalog() {
            try { await window.productsReady; } catch (_) { /* The editorial stage also works offline. */ }
            updateDetails(selected);
            updateCollectionLinks();
        }
        syncCatalog();
        window.addEventListener('luxe:catalog-status', syncCatalog);
        // Warm the two small local references only after the opening image loads.
        const warmImages = () => artwork.slice(1).forEach(prepare);
        if (image.complete) warmImages();
        else image.addEventListener('load', warmImages, { once: true });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})();
