// Published storefront imagery; defaults also keep the editorial pages usable offline.
(function () {
    'use strict';
    const defaults = {
        slides: [
            { id: 'ijele', title: 'Ijele', image: 'assets/products/ijele.jpg', alt: 'Black Ijele tee with warm lettering and intricate expressive artwork', productId: null },
            { id: 'durbar', title: 'Durbar', image: 'assets/products/durbar.jpg', alt: 'Black tee with gold Durbar lettering and a mounted figure print', productId: null },
            { id: 'dun-dun', title: 'Dùn Dùn', image: 'assets/products/dun-dun.jpg', alt: 'Black Dùn Dùn tee with yellow lettering and a print of three drummers', productId: null },
        ],
        collections: {
            men: { image: 'https://images.unsplash.com/photo-1617137968427-85924c800a22?w=1200&auto=format&fit=crop', focusY: 50 },
            women: { image: 'https://images.unsplash.com/photo-1567401893414-76b7b1e5a7a5?w=1200&auto=format&fit=crop', focusY: 50 },
        },
        detail: { image: 'assets/products/durbar.jpg', alt: 'A closer look at the gold Durbar lettering and detailed artwork', linkLabel: 'Explore Durbar', productId: null, focusY: 50 },
    };
    const cacheKey = 'alkebulan_storefront_content_v1';
    const clone = value => JSON.parse(JSON.stringify(value));
    let current = { content: clone(defaults), revision: null, updatedAt: null };
    let pending;
    const preparedImages = new Map();
    const imageRequests = new WeakMap();
    const placeholder = 'assets/brand/product-placeholder.svg';

    function safeImage(value) {
        if (typeof value !== 'string' || !value || value.length > 2048 || /[\s<>"\\]/.test(value)) return '';
        if (/^assets\/[a-zA-Z0-9/_.-]+$/.test(value) && !value.includes('..')) return value;
        try {
            const url = new URL(value);
            return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
        } catch { return ''; }
    }
    function validate(content) {
        if (!content || !Array.isArray(content.slides) || content.slides.length < 1 || content.slides.length > 12) return 'Keep between 1 and 12 slideshow images.';
        if (new Set(content.slides.map(slide => slide?.id)).size !== content.slides.length) return 'Each slide must have a unique ID.';
        const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
        for (const slide of content.slides) {
            if (!slide || !/^[a-zA-Z0-9_-]{1,64}$/.test(slide.id) || !text(slide.title, 80) || !text(slide.alt, 300)) return 'Give every slide a title and image description.';
        }
        if (!text(content.detail?.alt, 300) || !text(content.detail?.linkLabel, 80)) return 'Add a description and link label for the closer look image.';
        for (const item of [...content.slides, content.collections?.men, content.collections?.women, content.detail]) {
            if (!item || !safeImage(item.image)) return 'Choose an uploaded image or a secure https image URL for every image.';
            if ('focusY' in item && (!Number.isFinite(item.focusY) || item.focusY < 0 || item.focusY > 100)) return 'Image position must be between 0 and 100.';
            if (item.productId != null && (!Number.isSafeInteger(item.productId) || item.productId <= 0)) return 'Choose a valid linked product.';
        }
        return '';
    }
    function imageUrl(value, width = 1440) {
        const safe = safeImage(value);
        if (safe.startsWith('assets/')) return safe;
        return safe ? window.LuxeMedia?.cloudinaryUrl(safe, { width, crop: 'limit' }) || safe : '';
    }
    function prepareImage(url) {
        if (!url) return Promise.resolve(false);
        if (!preparedImages.has(url)) {
            preparedImages.set(url, new Promise(resolve => {
                const probe = new Image();
                let complete = false;
                const timer = setTimeout(() => finish(false), 12000);
                function finish(ok) {
                    if (complete) return;
                    complete = true;
                    clearTimeout(timer);
                    probe.onload = probe.onerror = null;
                    if (!ok) probe.removeAttribute('src');
                    resolve(ok);
                }
                probe.onload = () => finish(true);
                probe.onerror = () => finish(false);
                probe.src = url;
            }));
        }
        return preparedImages.get(url);
    }
    function resolveImage(element, url, apply) {
        if (imageRequests.get(element)?.url === url) return;
        const request = { url };
        imageRequests.set(element, request);
        prepareImage(url).then(ok => {
            if (imageRequests.get(element) !== request) return;
            apply(ok ? url : placeholder, !ok);
        });
    }
    function publish(data) {
        if (!data || validate(data.content) || !Number.isSafeInteger(data.revision) || data.revision < 1) return false;
        current = clone(data);
        try { localStorage.setItem(cacheKey, JSON.stringify(current)); } catch { /* Storage is optional. */ }
        applyImages();
        window.dispatchEvent(new CustomEvent('luxe:site-content', { detail: clone(current.content) }));
        return true;
    }
    async function load() {
        if (pending) return pending;
        pending = (async () => {
            try {
                const result = await window.LuxeStorefront.getContent();
                if (result.error) return result;
                if (!publish(result.data)) return { data: null, error: { message: 'Published images are unavailable. Please try again.' } };
                return { data: clone(current), error: null };
            } catch (error) {
                return { data: null, error: { message: error?.message || 'Unable to load published images.' } };
            } finally { pending = null; }
        })();
        return pending;
    }
    async function save(content, revision) {
        const message = validate(content);
        if (message) return { data: null, error: { message } };
        const result = await window.LuxeStorefront.saveContent(clone(content), revision);
        if (!result.error && !publish(result.data)) return { data: null, error: { message: 'The save could not be verified. Reload the published images before trying again.' } };
        return result;
    }
    function detailProduct() {
        const detail = current.content.detail;
        const products = window.getProducts?.() || [];
        if (detail.productId) return products.find(product => Number(product.id) === detail.productId);
        if (detail.image !== defaults.detail.image) return null;
        const matches = products.filter(product => String(product.brand).trim().toLowerCase() === 'alkebulan' && /\bdurbar\b/i.test(product.name));
        return matches.length === 1 ? matches[0] : null;
    }
    function applyImages() {
        for (const key of ['men', 'women']) {
            const hero = document.querySelector(`.${key}-hero`);
            const settings = current.content.collections[key];
            if (hero) {
                const url = imageUrl(settings.image, Math.min(1920, Math.ceil(window.innerWidth * (window.devicePixelRatio || 1))));
                resolveImage(hero, url, (source, fallback) => {
                    hero.style.backgroundImage = `linear-gradient(rgba(0,0,0,.4),rgba(0,0,0,.4)), url("${source}")`;
                    hero.dataset.imageFallback = String(fallback);
                });
                hero.style.backgroundPosition = `center ${settings.focusY ?? 50}%`;
            }
        }
        const detail = current.content.detail;
        const detailImage = document.querySelector('.detail-image img');
        if (detailImage) {
            resolveImage(detailImage, imageUrl(detail.image), (source, fallback) => {
                detailImage.classList.remove('image-unavailable');
                detailImage.removeAttribute('srcset');
                detailImage.src = source;
                detailImage.dataset.imageFallback = String(fallback);
                detailImage.parentElement.classList.toggle('custom-detail-image', fallback || detail.image !== defaults.detail.image);
            });
            detailImage.alt = detail.alt;
            detailImage.style.objectPosition = `center ${detail.focusY ?? 50}%`;
        }
        const detailLink = document.getElementById('detailLink');
        if (detailLink) {
            const product = detailProduct();
            detailLink.href = product ? `product.html?id=${encodeURIComponent(product.id)}` : 'shop.html';
            detailLink.setAttribute('aria-label', product ? `${detail.linkLabel} — ${product.name}` : `${detail.linkLabel} in the collection`);
            if (detailLink.firstChild?.nodeType === Node.TEXT_NODE) detailLink.firstChild.textContent = detail.linkLabel + ' ';
        }
    }
    try {
        const cached = JSON.parse(localStorage.getItem(cacheKey));
        if (cached && !validate(cached.content) && Number.isSafeInteger(cached.revision) && cached.revision > 0) current = cached;
    } catch { /* First visit or unavailable storage: keep the bundled images. */ }
    window.LuxeSiteContent = { defaults: () => clone(defaults), snapshot: () => clone(current), validate, safeImage, imageUrl, prepareImage, load, save, applyImages };
    if (!document.body.classList.contains('admin-page')) {
        applyImages();
        load();
        window.addEventListener('luxe:catalog-status', applyImages);
        window.addEventListener('pageshow', event => { if (event.persisted) load(); });
        window.addEventListener('online', () => {
            preparedImages.clear();
            document.querySelectorAll('[data-image-fallback="true"]').forEach(element => imageRequests.delete(element));
            load();
        });
    }
})();
