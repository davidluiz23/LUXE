// js/product.js - Product Detail Page Logic

// Hide loader immediately
(function hideLoader() {
    const loader = document.getElementById('loader');
    if (loader) {
        loader.style.display = 'none';
        loader.style.opacity = '0';
        loader.style.visibility = 'hidden';
        loader.classList.add('hidden');
    }
})();

// Get product ID from URL
const urlParams = new URLSearchParams(window.location.search);
const productId = parseInt(urlParams.get('id'));
const collectionDesign = (window.AlkebulanDesigns || []).find(design => design.key === urlParams.get('piece'));
if (collectionDesign) document.body.dataset.collectionDesign = collectionDesign.key;

// Render product details when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
    const relatedGrid = document.getElementById('relatedProducts');
    if (collectionDesign) {
        renderProductDetails(collectionPreview(collectionDesign), { pending: true });
        window.LuxeCatalogUI.renderCollection(relatedGrid, collectionDesign.key, { pending: true });
    } else if (relatedGrid) window.showProductGridLoading?.(relatedGrid, 4);

    // Wait for the live product catalog (Supabase) to finish loading
    // before looking up this product — it used to be looked up
    // synchronously at script load, before the catalog had a chance
    // to arrive from the network, which risked a false "Not Found".
    if (window.productsReady) await window.productsReady;
    const product = collectionDesign
        ? window.getProducts().find(product => window.LuxeCollection.keyForProduct(product) === collectionDesign.key)
        : (typeof getProductById === 'function') ? getProductById(productId) : ((window.products || []).find(p => p.id === productId));
    if (collectionDesign && !product) {
        renderProductDetails(collectionPreview(collectionDesign));
        window.LuxeCatalogUI.renderCollection(relatedGrid, collectionDesign.key);
        return;
    }

    // Hide loader again
    const loader = document.getElementById('loader');
    if (loader) {
        loader.style.display = 'none';
        loader.classList.add('hidden');
    }

    if (!product) {
        window.finishProductGridLoading?.(relatedGrid);
        if (relatedGrid) relatedGrid.replaceChildren();
        const container = document.getElementById('productDetails');
        if (container) {
            const catalogUnavailable = window.LuxeCatalogStatus?.state === 'unavailable';
            container.innerHTML = `
                <div style="text-align: center; padding: 80px 0;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 3rem; color: #E74C3C; margin-bottom: 20px;"></i>
                    <h2>${catalogUnavailable ? 'Catalog temporarily unavailable' : 'Product not found'}</h2>
                    <p style="color: #777; margin-bottom: 20px;">${catalogUnavailable
                        ? 'We could not verify the live product catalog. Please try again shortly.'
                        : 'This product does not exist or is no longer published.'}</p>
                    <a href="${catalogUnavailable ? window.location.href : 'shop.html'}" class="btn btn-primary">${catalogUnavailable ? 'Try again' : 'Return to shop'}</a>
                </div>
            `;
        }
        return;
    }
    
    renderProductDetails(product);
    renderRelatedProducts(product);
    updateProductSeo(product);
});

function escapeProductHtml(value) { return window.LuxeUtils.escapeHtml(value); }

function collectionPreview(design) {
    // Reuse the same product page while the administrator's inventory loads.
    // A preview cannot enter a cart or advertise a fabricated price/stock.
    return { ...design, name: `${design.name} graphic tee`, brand: 'ALKEBULAN',
        subcategory: 'Graphic tee', description: design.description, sizes: [], colors: [] };
}

function safeProductColor(value) {
    const aliases = {
        'navy blue': 'navy',
        'midnight blue': '#191970',
        'royal blue': 'royalblue',
        'sky blue': 'skyblue',
        'light blue': 'lightblue',
        'midnight black': '#0b0b0d',
        'military green': '#4b5320',
        'olive green': 'olive',
        'forest green': 'forestgreen',
        'off white': '#f5f2e9',
        'off-white': '#f5f2e9',
        'dark grey': 'darkgray',
        'dark gray': 'darkgray',
        grey: 'gray',
    };
    const candidate = String(value || '').split('/')[0].trim().toLowerCase();
    const normalized = aliases[candidate] || candidate;
    return typeof CSS !== 'undefined' && CSS.supports?.('color', normalized) ? normalized : '#777777';
}

function detailMoney(product, oldPrice = false) {
    const formatted = window.LuxeMoney?.forProduct?.(product, oldPrice);
    if (formatted) return formatted;
    const usdValue = Number(oldPrice ? product?.oldPrice : product?.price);
    const ngnRaw = oldPrice ? product?.oldPriceNGN : product?.priceNGN;
    const ngnValue = ngnRaw === null || ngnRaw === undefined || ngnRaw === '' ? NaN : Number(ngnRaw);
    return {
        usd: Number.isFinite(usdValue) ? `$${usdValue.toFixed(2)}` : '',
        ngn: Number.isFinite(ngnValue) ? `₦${ngnValue.toLocaleString('en-NG', { maximumFractionDigits: 0 })}` : '',
    };
}

function detailPriceMarkup(product) {
    const current = detailMoney(product);
    const old = detailMoney(product, true);
    const primary = current.ngn || current.usd || 'Price unavailable';
    const secondary = current.ngn && current.usd ? current.usd : '';
    const oldPrimary = old.ngn || old.usd || '';
    return `<span class="current-price">${escapeProductHtml(primary)}</span>
        ${secondary ? `<span class="product-price-secondary">${escapeProductHtml(secondary)}</span>` : ''}
        ${oldPrimary ? `<span class="old-price">${escapeProductHtml(oldPrimary)}</span>` : ''}`;
}

function productOptionValues(values) {
    return [...new Set((Array.isArray(values) ? values : [])
        .map(value => String(value || '').trim().slice(0, 80))
        .filter(Boolean))];
}

function detailStockLimit(product) {
    const quantity = Number(product?.stockQuantity);
    if (Number.isInteger(quantity)) return Math.max(0, Math.min(window.CART_MAX_QUANTITY || 99, quantity));
    return product?.inStock === false ? 0 : (window.CART_MAX_QUANTITY || 99);
}

function selectedDetailOptions() {
    return {
        size: document.querySelector('.size-btn-product.active')?.dataset.size || '',
        color: document.querySelector('.color-btn.active')?.dataset.color || '',
    };
}

function renderProductDetails(product, { pending = false } = {}) {
    const container = document.getElementById('productDetails');
    if (!container) return;

    const published = Number.isSafeInteger(Number(product.id)) && Number(product.id) > 0;
    const design = (window.AlkebulanDesigns || []).find(item => item.key === (product.key || window.LuxeCollection?.keyForProduct(product)));
    const description = product.description || design?.description || '';
    document.title = `${product.name} | ALKEBULAN`;
    document.querySelector('meta[name="description"]')?.setAttribute('content', description);
    if (!published) document.querySelectorAll('script[type="application/ld+json"]').forEach(script => script.remove());

    // Generate star rating HTML
    const rating = Math.max(0, Math.min(5, Number(product.rating) || 0));
    const starsHtml = generateStars(rating);
    const colors = productOptionValues(product.colors);
    const sizes = productOptionValues(product.sizes);
    const stockLimit = detailStockLimit(product);
    const isAvailable = published && product.inStock !== false && stockLimit > 0;

    // Generate color options HTML
    const colorsHtml = colors.map((color, index) => `
        <button class="color-btn${index === 0 ? ' active' : ''}" type="button" style="background: ${safeProductColor(color)}" data-color="${escapeProductHtml(color)}" title="${escapeProductHtml(color)}" aria-label="Choose ${escapeProductHtml(color)}" aria-pressed="${index === 0}"></button>
    `).join('');

    // Generate size options HTML
    const sizesHtml = sizes.map((size, index) => `
        <button class="size-btn-product${index === 0 ? ' active' : ''}" type="button" data-size="${escapeProductHtml(size)}" aria-pressed="${index === 0}">${escapeProductHtml(size)}</button>
    `).join('');

    // Generate specs HTML
    const specsHtml = `
        ${product.category ? `<div class="spec-item"><span class="spec-label">Category</span><span class="spec-value">${escapeProductHtml(product.category)}</span></div>` : ''}
        <div class="spec-item"><span class="spec-label">Subcategory</span><span class="spec-value">${escapeProductHtml(product.subcategory || 'Collection')}</span></div>
        <div class="spec-item"><span class="spec-label">Brand</span><span class="spec-value">${escapeProductHtml(product.brand || window.LuxeBrand?.name || 'ALKEBULAN')}</span></div>
        ${rating > 0 ? `<div class="spec-item"><span class="spec-label">Rating</span><span class="spec-value">${rating.toFixed(1)} / 5</span></div>` : ''}
    `;

    const galleryImages = [product.image, product.hoverImage, ...(product.hoverImages || [])]
        .map(image => window.LuxeMedia.safeImageUrl(image))
        .filter((image, index, list) => image && list.indexOf(image) === index)
        .slice(0, 4);
    const primaryImage = galleryImages[0] || product.image;
    const thumbnailsHtml = galleryImages.map((image, index) => `
        <button class="thumbnail-button${index === 0 ? ' active' : ''}" type="button" data-image="${window.LuxeMedia.escapeAttribute(image)}" aria-label="Show product image ${index + 1}">
            <img ${window.LuxeMedia.attributes(image, {
                preset: 'thumb',
                alt: `${product.name} view ${index + 1}`,
                className: index === 0 ? 'active' : '',
            })}>
        </button>
    `).join('');

    const discountPercent = (product.discount && product.oldPrice && product.oldPrice > product.price) 
        ? Math.round((1 - product.price / product.oldPrice) * 100) 
        : 0;

    container.innerHTML = `
        <div class="piece-masthead"><a href="shop.html"><span aria-hidden="true">←</span> The collection</a><span>ALKEBULAN / SELECTED PIECE</span></div>
        <div class="product-detail-grid">
            <!-- Product Gallery -->
            <div class="product-gallery">
                <button class="product-main-image-trigger" id="productMainImageTrigger" type="button" aria-label="View full-resolution image">
                    <img id="mainImage" ${window.LuxeMedia.attributes(primaryImage, {
                        preset: 'detail',
                        alt: product.name,
                        className: 'main-image',
                        priority: true,
                    })}>
                    <span class="product-zoom-hint"><i class="fas fa-expand" aria-hidden="true"></i> View original</span>
                </button>
                ${discountPercent > 0 ? `<span class="discount-badge-large">${discountPercent}% OFF</span>` : ''}
                ${product.trending ? `<span class="trending-badge-large"><i class="fas fa-fire"></i> Trending now</span>` : ''}
                <div class="thumbnail-grid" ${galleryImages.length < 2 ? 'hidden' : ''}>
                    ${thumbnailsHtml}
                </div>
            </div>

            <!-- Product Info -->
            <div class="product-info">
                <span class="product-category">${escapeProductHtml(product.brand || 'ALKEBULAN')} / ${escapeProductHtml(product.subcategory || 'Graphic tee')}</span>
                <h1>${escapeProductHtml(product.name)}</h1>
                
                ${rating > 0 ? `<div class="product-rating" aria-label="Rated ${rating.toFixed(1)} out of 5">
                    <span class="stars" aria-hidden="true">${starsHtml}</span>
                    <span class="rating-count">${product.reviewCount !== null && product.reviewCount !== undefined
                        ? `${Math.max(0, Number(product.reviewCount) || 0)} review${Number(product.reviewCount) === 1 ? '' : 's'}`
                        : `${rating.toFixed(1)} / 5`}</span>
                </div>` : ''}

                <div class="product-price-section">
                    ${published ? detailPriceMarkup(product) : `<span class="product-price-pending" role="status">${pending ? 'Loading price…' : window.LuxeCatalogStatus?.state === 'unavailable' ? 'Price unavailable. Please refresh to try again.' : 'Price not published yet'}</span>`}
                </div>

                <p class="product-intro">${escapeProductHtml(description)}</p>

                <section class="product-options-panel" aria-labelledby="productOptionsHeading" ${published ? '' : 'hidden'}>
                    <h2 class="sr-only" id="productOptionsHeading">Choose your options</h2>

                    ${colors.length ? `<!-- Color Selection -->
                    <div class="color-selection" role="group" aria-labelledby="productColorLabel">
                        <span id="productColorLabel">Color:</span>
                        <div class="color-options">
                            ${colorsHtml}
                        </div>
                    </div>` : ''}

                    ${sizes.length ? `<!-- Size Selection -->
                    <div class="size-selection" role="group" aria-labelledby="productSizeLabel">
                        <span id="productSizeLabel">Size:</span>
                        <div class="size-options">
                            ${sizesHtml}
                        </div>
                    </div>` : ''}

                    <!-- Quantity -->
                    <div class="quantity-selector">
                        <label>Quantity:</label>
                        <div class="quantity-control">
                            <button type="button" aria-label="Decrease quantity" data-quantity-delta="-1">−</button>
                            <span id="quantityDisplay" data-max="${stockLimit}" aria-live="polite">1</span>
                            <button type="button" aria-label="Increase quantity" data-quantity-delta="1">+</button>
                        </div>
                    </div>
                </section>

                <!-- ADD TO CART & WHATSAPP -->
                <div class="commerce-actions">
                    <div class="product-mobile-summary" aria-hidden="true"><span>${escapeProductHtml(product.name)}</span><strong>${published ? escapeProductHtml(detailMoney(product).ngn || detailMoney(product).usd) : 'Not released'}</strong></div>
                    <button type="button" class="add-to-cart" id="productAddToCart" ${!isAvailable ? 'disabled aria-disabled="true"' : ''}>
                        <i class="fas fa-shopping-bag" aria-hidden="true"></i> ${published && !isAvailable ? 'Sold out' : 'Add to cart'}
                    </button>
                    <button type="button" class="wishlist-btn-product" id="productWishlistButton" ${published ? `data-id="${Number(product.id)}"` : 'disabled'} aria-label="Save ${escapeProductHtml(product.name)} to wishlist" aria-pressed="false">
                        <i class="fas fa-heart" aria-hidden="true"></i>
                    </button>
                </div>
                <button type="button" class="whatsapp-btn-product" id="productWhatsAppOrder" ${!isAvailable ? 'disabled aria-disabled="true"' : ''}>
                    <i class="fab fa-whatsapp" aria-hidden="true"></i> Order via WhatsApp
                </button>

                ${!published && !pending && window.LuxeCatalogStatus?.state !== 'unavailable' ? '<p class="product-order-status" role="status">This tee is not open for orders yet.</p>' : ''}
                <details class="product-description-panel">
                    <summary class="product-panel-label" id="productDetailsHeading">Product details</summary>
                    ${design ? `<p class="product-description">${escapeProductHtml(design.story)}</p>` : ''}
                    <div class="product-specs">
                        ${specsHtml}
                    </div>
                </details>

                <!-- Meta -->
                <div class="product-meta">
                    ${published ? `<div class="meta-item"><i class="fas fa-tag" aria-hidden="true"></i> SKU: ${window.LuxeBrand?.skuPrefix || 'ALK'}-${String(product.id).padStart(4, '0')}</div>` : ''}
                    <div class="meta-item"><i class="fas fa-box" aria-hidden="true"></i><a href="shipping.html">Shipping &amp; delivery details</a></div>
                    <div class="meta-item"><i class="fas fa-undo" aria-hidden="true"></i><a href="returns.html">Returns &amp; exchanges</a></div>
                    <div class="meta-item"><a href="contact.html">Need help choosing your size? Talk to us ↗</a></div>
                </div>
            </div>
        </div>
        <div class="product-image-viewer" id="productImageViewer" role="dialog" aria-modal="true" aria-label="Full-resolution product image" hidden>
            <button class="product-image-viewer-backdrop" type="button" tabindex="-1" data-close-image-viewer aria-label="Close image viewer"></button>
            <div class="product-image-viewer-dialog">
                <button class="product-image-viewer-close" type="button" data-close-image-viewer aria-label="Close image viewer">&times;</button>
                <img id="fullResolutionImage" alt="${escapeProductHtml(product.name)} full-resolution view" decoding="async">
                <div class="product-image-viewer-meta">
                    <span>${escapeProductHtml(product.name)}</span>
                    <a id="fullResolutionLink" href="${window.LuxeMedia.escapeAttribute(primaryImage)}" target="_blank" rel="noopener">Open image <i class="fas fa-arrow-up-right-from-square" aria-hidden="true"></i></a>
                </div>
            </div>
        </div>
    `;
    window.LuxeMedia.hydrate(container);
    window.syncWishlistButtons?.(container);

    const mainImageElement = container.querySelector('#mainImage');
    const viewer = container.querySelector('#productImageViewer');
    const viewerImage = container.querySelector('#fullResolutionImage');
    const viewerLink = container.querySelector('#fullResolutionLink');
    const mainTrigger = container.querySelector('#productMainImageTrigger');
    const closeViewer = () => {
        if (!viewer || viewer.hidden) return;
        viewer.hidden = true;
        document.body.classList.remove('product-image-viewer-open');
        if (viewerImage) viewerImage.removeAttribute('src');
        mainTrigger?.focus();
    };
    const openViewer = () => {
        const original = window.LuxeMedia.safeImageUrl(mainImageElement?.dataset.luxeOriginal);
        if (!original || !viewer || !viewerImage || !viewerLink) return;
        viewerImage.src = original;
        viewerLink.href = original;
        viewer.hidden = false;
        document.body.classList.add('product-image-viewer-open');
        viewer.querySelector('.product-image-viewer-close')?.focus();
    };
    mainTrigger?.addEventListener('click', openViewer);
    viewer?.querySelectorAll('[data-close-image-viewer]').forEach(button => button.addEventListener('click', closeViewer));
    document.addEventListener('keydown', event => {
        if (!viewer || viewer.hidden) return;
        if (event.key === 'Escape') {
            event.preventDefault();
            closeViewer();
            return;
        }
        if (event.key !== 'Tab') return;
        const focusable = Array.from(viewer.querySelectorAll('button, a[href]'))
            .filter(element => !element.hidden && element.tabIndex >= 0 && !element.classList.contains('product-image-viewer-backdrop'));
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (!first || !last) return;
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    });

    container.querySelectorAll('.thumbnail-button').forEach(button => {
        button.addEventListener('click', () => {
            window.changeImage(button.querySelector('img'), button.dataset.image);
            container.querySelectorAll('.thumbnail-button').forEach(item => item.classList.toggle('active', item === button));
        });
    });

    // Color selection
    container.querySelectorAll('.color-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            container.querySelectorAll('.color-btn').forEach(b => {
                b.classList.remove('active');
                b.setAttribute('aria-pressed', 'false');
            });
            this.classList.add('active');
            this.setAttribute('aria-pressed', 'true');
        });
    });

    // Size selection
    container.querySelectorAll('.size-btn-product').forEach(btn => {
        btn.addEventListener('click', function() {
            container.querySelectorAll('.size-btn-product').forEach(b => {
                b.classList.remove('active');
                b.setAttribute('aria-pressed', 'false');
            });
            this.classList.add('active');
            this.setAttribute('aria-pressed', 'true');
        });
    });

    container.querySelectorAll('[data-quantity-delta]').forEach(button => {
        button.addEventListener('click', () => window.updateQuantity(Number(button.dataset.quantityDelta)));
    });
    container.querySelector('#productAddToCart')?.addEventListener('click', async event => {
        const button = event.currentTarget;
        if (!isAvailable || button.disabled) return;
        button.disabled = true;
        try {
            if (await window.addToCartHandler(product.id)) {
                button.innerHTML = 'Added to cart <span aria-hidden="true">✓</span>';
                setTimeout(() => { if (button.isConnected) button.innerHTML = '<i class="fas fa-shopping-bag" aria-hidden="true"></i> Add to cart'; }, 1600);
            }
        } finally { button.disabled = false; }
    });
    container.querySelector('#productWhatsAppOrder')?.addEventListener('click', () => {
        const quantity = Number.parseInt(container.querySelector('#quantityDisplay')?.textContent || '1', 10);
        window.sendProductToWhatsApp?.(product.id, quantity, selectedDetailOptions());
    });
    container.querySelector('#productWishlistButton')?.addEventListener('click', (event) => {
        window.toggleWishlist?.(product.id, event.currentTarget);
    });
}

function generateStars(rating) {
    const normalized = Math.max(0, Math.min(5, Number(rating) || 0));
    const fullStars = Math.floor(normalized);
    const hasHalfStar = normalized % 1 >= 0.5;
    let stars = '';
    
    for (let i = 0; i < fullStars; i++) {
        stars += '<i class="fas fa-star" aria-hidden="true"></i>';
    }
    if (hasHalfStar) {
        stars += '<i class="fas fa-star-half-alt" aria-hidden="true"></i>';
    }
    const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);
    for (let i = 0; i < emptyStars; i++) {
        stars += '<i class="far fa-star" aria-hidden="true"></i>';
    }
    
    return stars;
}

function renderRelatedProducts(product) {
    const container = document.getElementById('relatedProducts');
    if (!container) return;
    window.finishProductGridLoading?.(container);

    const allProducts = (typeof getProducts === 'function') ? getProducts() : (window.products || []);
    let related = allProducts.filter(p => 
        p.category === product.category && p.id !== product.id
    );
    
    related = related.slice(0, 4);

    if (related.length === 0) {
        container.innerHTML = `<p style="grid-column: 1/-1; text-align: center; color: #777777; padding: 40px 0;">No related products found.</p>`;
        return;
    }

    window.LuxeCatalogUI.render(container, related);
}

// Global window functions for inline onclick handlers
window.changeImage = function(elem, src) {
    const mainImage = document.getElementById('mainImage');
    if (mainImage && src) {
        window.LuxeMedia.apply(mainImage, src, {
            preset: 'detail',
            alt: mainImage.alt,
            priority: true,
        });
    }
    document.querySelectorAll('.thumbnail-grid img').forEach(img => {
        img.classList.remove('active');
    });
    if (elem && elem.classList) {
        elem.classList.add('active');
    }
};

window.updateQuantity = function(delta) {
    const display = document.getElementById('quantityDisplay');
    if (!display) return;
    const maximum = Math.max(1, Math.min(window.CART_MAX_QUANTITY || 99, Number(display.dataset.max) || 99));
    let current = Number.parseInt(display.textContent, 10) || 1;
    current = Math.max(1, Math.min(maximum, current + Math.trunc(Number(delta) || 0)));
    display.textContent = current;
};

window.addToCartHandler = function(id) {
    const display = document.getElementById('quantityDisplay');
    const quantity = display ? Number.parseInt(display.textContent, 10) : 1;
    const options = selectedDetailOptions();
    if (typeof addToCart === 'function') {
        return addToCart(id, quantity, options);
    } else if (typeof window.addToCart === 'function') {
        return window.addToCart(id, quantity, options);
    }
    return false;
};

window.addToWishlistHandler = function(id) {
    if (typeof addToWishlist === 'function') {
        addToWishlist(id);
    } else if (typeof window.addToWishlist === 'function') {
        window.addToWishlist(id);
    }
};


// Dynamically update document title, social meta tags, and Schema.org Product JSON-LD
function updateProductSeo(product) {
    if (!product) return;
    const productName = product.name || 'Graphic tee';
    const brandName = product.brand || 'ALKEBULAN';
    const titleText = `${productName} | ${brandName}`;
    document.title = titleText;

    const descText = product.description 
        ? product.description.slice(0, 160)
        : `Shop ${productName} by ALKEBULAN. View product details, sizes and prices.`;

    // Update Meta Description
    const metaDesc = document.getElementById('metaDescription') || document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.setAttribute('content', descText);

    // Update Canonical
    const canonical = document.getElementById('canonicalUrl') || document.querySelector('link[rel="canonical"]');
    const currentUrl = `https://alkebulan.boutique/product.html?id=${encodeURIComponent(product.id)}`;
    if (canonical) canonical.setAttribute('href', currentUrl);

    // Update Open Graph
    const ogTitle = document.getElementById('ogTitle') || document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.setAttribute('content', titleText);

    const ogDesc = document.getElementById('ogDescription') || document.querySelector('meta[property="og:description"]');
    if (ogDesc) ogDesc.setAttribute('content', descText);

    const ogUrl = document.getElementById('ogUrl') || document.querySelector('meta[property="og:url"]');
    if (ogUrl) ogUrl.setAttribute('content', currentUrl);

    const imageUrl = product.image 
        ? (product.image.startsWith('http') ? product.image : `https://alkebulan.boutique/${product.image.replace(/^\//, '')}`) 
        : 'https://alkebulan.boutique/assets/products/ijele.jpg';

    const ogImage = document.getElementById('ogImage') || document.querySelector('meta[property="og:image"]');
    if (ogImage) ogImage.setAttribute('content', imageUrl);

    // Update Twitter Cards
    const twTitle = document.getElementById('twitterTitle') || document.querySelector('meta[name="twitter:title"]');
    if (twTitle) twTitle.setAttribute('content', titleText);

    const twDesc = document.getElementById('twitterDescription') || document.querySelector('meta[name="twitter:description"]');
    if (twDesc) twDesc.setAttribute('content', descText);

    const twImage = document.getElementById('twitterImage') || document.querySelector('meta[name="twitter:image"]');
    if (twImage) twImage.setAttribute('content', imageUrl);

    // Update Structured Data JSON-LD
    let scriptTag = document.getElementById('productJsonLd');
    if (!scriptTag) {
        scriptTag = document.createElement('script');
        scriptTag.id = 'productJsonLd';
        scriptTag.type = 'application/ld+json';
        document.head.appendChild(scriptTag);
    }
    const schemaData = {
        "@context": "https://schema.org",
        "@type": "Product",
        "name": productName,
        "image": imageUrl,
        "description": descText,
        "sku": `ALK-${product.id}`,
        "brand": {
            "@type": "Brand",
            "name": brandName
        },
        "offers": {
            "@type": "Offer",
            "url": currentUrl,
            "priceCurrency": "USD",
            "price": String(product.price),
            "availability": product.inStock !== false ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
            "itemCondition": "https://schema.org/NewCondition"
        }
    };
    if (product.rating > 0 && product.reviewCount > 0) {
        schemaData.aggregateRating = {
            "@type": "AggregateRating",
            "ratingValue": String(product.rating),
            "reviewCount": String(product.reviewCount)
        };
    }
    scriptTag.textContent = JSON.stringify(schemaData, null, 2);
}
