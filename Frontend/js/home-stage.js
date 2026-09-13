// Presentation only: reference photography never creates or changes catalog data.
(function initializeArtworkStage() {
    'use strict';
    const referenceArtwork = [
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
        let artwork = referenceArtwork;
        let selectors = [...document.querySelectorAll('[data-artwork]')];
        const selectorGroup = document.querySelector('.artwork-selector');
        const collectionLinks = [...document.querySelectorAll('[data-collection-artwork]')];
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
        const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
        const photo = document.getElementById('stagePhoto');
        const playback = document.getElementById('stagePlayback');
        const outgoingPhoto = photo.cloneNode(true);
        outgoingPhoto.removeAttribute('id');
        outgoingPhoto.classList.add('stage-photo-outgoing');
        outgoingPhoto.setAttribute('aria-hidden', 'true');
        outgoingPhoto.hidden = true;
        const outgoingImage = outgoingPhoto.querySelector('img');
        outgoingImage.removeAttribute('id');
        outgoingImage.alt = '';
        photo.before(outgoingPhoto);
        const slideInterval = 5000;
        let selected = artwork[0];
        let selectionRequest = 0;
        let rotationIndex = 0;
        let rotationTimer = 0;
        let paused = reduced.matches;
        let reducedPlayback = false;
        let hovering = false;
        let focused = false;
        let visible = true;
        let frame = 0;
        let pointerX = 0;
        let pointerY = 0;
        const prepared = new Map();

        function products() { return window.getProducts?.() || []; }
        function matchingProduct(item) {
            if (item.productId) return products().find(product => Number(product.id) === item.productId) || null;
            if (!item.match) return null;
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
            window.LuxeSiteContent?.applyImages();
        }
        function updateCollectionLinks() {
            collectionLinks.forEach(anchor => {
                const item = referenceArtwork.find(item => item.key === anchor.dataset.collectionArtwork);
                if (!item) return;
                const product = matchingProduct(item);
                anchor.href = product ? productUrl(product) : 'shop.html';
                anchor.setAttribute('aria-label', product ? `View ${product.name}${product.inStock === false ? ' — sold out' : ''}` : `Explore ${item.name} in the collection`);
            });
        }
        function prepare(item) {
            if (!item) return Promise.resolve(false);
            if (!prepared.has(item.image)) {
                prepared.set(item.image, new Promise(resolve => {
                    const next = new Image();
                    next.onload = () => resolve(true);
                    next.onerror = () => { prepared.delete(item.image); resolve(false); };
                    next.src = item.image;
                }));
            }
            return prepared.get(item.image);
        }
        function stopTransition() {
            [image, outgoingImage].forEach(element => element.getAnimations?.().forEach(animation => animation.cancel()));
            outgoingPhoto.hidden = true;
        }
        function canRotate() { return artwork.length > 1 && (!reduced.matches || reducedPlayback) && !paused && !hovering && !focused && visible && !document.hidden; }
        function syncPlayback() {
            clearTimeout(rotationTimer);
            const playing = canRotate();
            playback.hidden = artwork.length < 2;
            stage.dataset.slideshowPlaying = String(playing);
            name.setAttribute('aria-live', playing ? 'off' : 'polite');
            playback.dataset.paused = String(!playing);
            playback.setAttribute('aria-label', playing ? 'Pause slideshow' : 'Play slideshow');
            playback.title = playing ? 'Pause slideshow' : 'Play slideshow';
            if (playing) rotationTimer = window.setTimeout(async () => {
                rotationIndex = (rotationIndex + 1) % artwork.length;
                await select(artwork[rotationIndex], { automatic: true });
                syncPlayback();
            }, slideInterval);
        }
        async function select(item, { automatic = false } = {}) {
            const request = ++selectionRequest;
            if (!(await prepare(item)) || request !== selectionRequest) return;
            // A slow image must not advance the stage after the visitor pauses it.
            if (automatic && !canRotate()) return;
            if (item === selected) return;
            const changedImage = item.image !== selected.image;
            stopTransition();
            outgoingPhoto.dataset.artworkPhoto = selected.photoKey || selected.key;
            outgoingPhoto.dataset.customPhoto = String(!!selected.custom);
            outgoingImage.src = selected.image;
            selected = item;
            rotationIndex = artwork.indexOf(item);
            stage.dataset.featuredArtwork = item.key;
            photo.dataset.artworkPhoto = item.photoKey || item.key;
            photo.dataset.customPhoto = String(!!item.custom);
            image.src = item.image;
            image.alt = item.alt;
            document.getElementById('stageNumber').textContent = `${String(artwork.indexOf(item) + 1).padStart(2, '0')} / ${String(artwork.length).padStart(2, '0')}`;
            selectors.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.artwork === item.key)));
            updateDetails(item);
            if (changedImage && !reduced.matches && image.animate) {
                outgoingPhoto.hidden = false;
                const timing = { duration: 900, easing: 'cubic-bezier(.22, 1, .36, 1)' };
                image.animate([
                    { opacity: 0, transform: 'translate3d(32px, 10px, 0) rotate(4deg) scale(.96)' },
                    { opacity: 1, transform: 'none' },
                ], timing);
                const exit = outgoingImage.animate([
                    { opacity: 1, transform: 'none' },
                    { opacity: 0, transform: 'translate3d(-32px, -8px, 0) rotate(-4deg) scale(1.02)' },
                ], timing);
                exit.onfinish = () => { outgoingPhoto.hidden = true; };
            }
        }
        selectorGroup.addEventListener('click', async event => {
                const button = event.target.closest('[data-artwork]');
                if (!button) return;
                clearTimeout(rotationTimer);
                await select(artwork.find(item => item.key === button.dataset.artwork));
                syncPlayback();
        });
            // Native Tab/Enter/Space remain available; arrows make comparisons easy.
        selectorGroup.addEventListener('keydown', event => {
                const button = event.target.closest('[data-artwork]');
                if (!button) return;
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                event.preventDefault();
                const current = selectors.indexOf(button);
                const next = event.key === 'Home' ? 0 : event.key === 'End' ? selectors.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + selectors.length) % selectors.length;
                selectors[next].focus({ preventScroll: true });
                selectors[next].click();
        });
        playback.hidden = false;
        playback.addEventListener('click', () => {
            paused = canRotate();
            reducedPlayback = !paused && reduced.matches;
            // An explicit Play action can resume while this control has focus.
            if (!paused) hovering = focused = false;
            syncPlayback();
        });
        stage.addEventListener('pointerenter', () => {
            hovering = finePointer.matches;
            syncPlayback();
        });
        stage.addEventListener('pointerleave', () => { hovering = false; syncPlayback(); });
        stage.addEventListener('focusin', event => {
            if (event.target !== playback) focused = true;
            syncPlayback();
        });
        stage.addEventListener('focusout', event => {
            if (!stage.contains(event.relatedTarget)) {
                focused = false;
                syncPlayback();
            }
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
            stopTransition();
            resetDepth();
            paused = reduced.matches;
            reducedPlayback = false;
            syncPlayback();
        });
        finePointer.addEventListener('change', () => {
            resetDepth();
            hovering = false;
            syncPlayback();
        });
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                if (frame) cancelAnimationFrame(frame);
                frame = 0;
            } else scheduleDepth();
            syncPlayback();
        });
        if ('IntersectionObserver' in window) {
            new IntersectionObserver(entries => {
                visible = entries[0].isIntersecting;
                if (visible) scheduleDepth();
                syncPlayback();
            }).observe(stage);
        }
        window.addEventListener('pagehide', () => { clearTimeout(rotationTimer); ++selectionRequest; stopTransition(); });
        window.addEventListener('pageshow', syncPlayback);
        syncPlayback();

        async function syncContent(content) {
            if (!content?.slides?.length) return;
            const nextArtwork = content.slides.map(slide => {
                const reference = referenceArtwork.find(item => item.image === slide.image);
                return { key: slide.id, photoKey: reference?.key, name: slide.title, image: window.LuxeSiteContent.imageUrl(slide.image), alt: slide.alt, productId: slide.productId, match: reference?.match, custom: !reference };
            });
            // Revalidating the same published document must not reset playback.
            if (nextArtwork.length === artwork.length && nextArtwork.every((item, index) =>
                ['key', 'name', 'image', 'alt'].every(key => item[key] === artwork[index][key])
                && (item.productId || null) === (artwork[index].productId || null))) return;
            artwork = nextArtwork;
            selectorGroup.replaceChildren(...artwork.map(item => {
                const button = document.createElement('button');
                button.type = 'button';
                button.dataset.artwork = item.key;
                button.setAttribute('aria-label', `Show ${item.name}`);
                button.setAttribute('aria-pressed', 'false');
                button.append(document.createElement('span'));
                return button;
            }));
            selectors = [...selectorGroup.children];
            clearTimeout(rotationTimer);
            // Removed slides cannot keep playing; the first published slide opens next.
            rotationIndex = 0;
            await select(artwork[0]);
            syncPlayback();
        }
        window.addEventListener('luxe:site-content', event => syncContent(event.detail));
        if (window.LuxeSiteContent) syncContent(window.LuxeSiteContent.snapshot().content);

        async function syncCatalog() {
            try { await window.productsReady; } catch (_) { /* The editorial stage also works offline. */ }
            updateDetails(selected);
            updateCollectionLinks();
        }
        syncCatalog();
        window.addEventListener('luxe:catalog-status', syncCatalog);
        // Warm the two small local references only after the opening image loads.
        const warmImages = () => artwork.slice(1, 3).forEach(prepare);
        if (image.complete) warmImages();
        else image.addEventListener('load', warmImages, { once: true });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})();
