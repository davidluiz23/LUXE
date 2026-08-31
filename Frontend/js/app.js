// js/app.js - Main Application Script

function escapeAppHtml(value) { return window.LuxeUtils.escapeHtml(value); }

function getAppProductMoney(product, oldPrice = false) {
    try {
        const formatted = window.LuxeMoney?.forProduct?.(product, oldPrice);
        if (formatted) return formatted;
    } catch (_) {
        // The local fallback keeps early/static rendering usable.
    }

    const usdValue = Number(oldPrice ? product.oldPrice : product.price);
    const ngnValue = Number(oldPrice ? product.oldPriceNGN : product.priceNGN);
    const usd = Number.isFinite(usdValue)
        ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(usdValue)
        : '';
    const ngn = Number.isFinite(ngnValue)
        ? new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(ngnValue)
        : '';
    return { usd, ngn, text: ngn || usd };
}

function renderAppProductPrice(product) {
    const current = getAppProductMoney(product);
    const previous = getAppProductMoney(product, true);
    const primary = current.ngn || current.usd || current.text || 'Price unavailable';
    const secondary = current.ngn && current.usd ? current.usd : '';
    const oldPrimary = previous.ngn || previous.usd || '';

    return `
        <span class="product-current-price">${escapeAppHtml(primary)}</span>
        ${secondary ? `<span class="product-price-secondary">${escapeAppHtml(secondary)}</span>` : ''}
        ${oldPrimary ? `<span class="old-price">${escapeAppHtml(oldPrimary)}</span>` : ''}
    `;
}

document.addEventListener('DOMContentLoaded', async function() {
    // Make the page interactive immediately. Catalog requests can be slow on
    // mobile networks and must never leave the fixed loader blocking touches.
    const loader = document.getElementById('loader');
    if (loader) {
        setTimeout(function() {
            loader.classList.add('hidden');
        }, 300);
    }

    // Navigation
    const hamburger = document.getElementById('hamburger');
    const mobileMenu = document.getElementById('mobileMenu');
    const mobileClose = document.getElementById('mobileClose');

    if (hamburger && mobileMenu) {
        hamburger.addEventListener('click', function() {
            mobileMenu.classList.add('active');
        });
    }
    if (mobileClose && mobileMenu) {
        mobileClose.addEventListener('click', function() {
            mobileMenu.classList.remove('active');
        });
    }

    const currentPage = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
    const productGrid = currentPage === 'index.html' ? document.getElementById('productGrid') : null;
    if (productGrid) window.showProductGridLoading?.(productGrid, 8);

    // Wait only before catalog-dependent rendering. Navigation and scrolling
    // above remain usable even if the backend request is delayed.
    if (window.productsReady) await window.productsReady;

    // Back to top
    const backBtn = document.getElementById('backToTop');
    if (backBtn) {
        backBtn.type = 'button';
        backBtn.setAttribute('aria-label', 'Back to top');
        window.addEventListener('scroll', function() {
            if (window.scrollY > 500) {
                backBtn.classList.add('visible');
            } else {
                backBtn.classList.remove('visible');
            }
        });
        backBtn.addEventListener('click', function() {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    // Load home page featured products if grid exists
    if (productGrid) {
        const getFeatured = (typeof getFeaturedProducts === 'function') ? getFeaturedProducts : (window.getFeaturedProducts || function() { return (window.products || []).slice(0, 8); });
        const products = getFeatured();
        if (products && products.length > 0) {
            renderProducts(products, productGrid);
        } else {
            window.finishProductGridLoading?.(productGrid);
            productGrid.innerHTML = '';
        }
    }

    // Update counts
    if (typeof updateCartCount === 'function') updateCartCount();
    if (typeof updateWishlistCount === 'function') updateWishlistCount();
    // Newsletter
    const newsletterForm = document.getElementById('newsletterForm');
    if (newsletterForm) {
        newsletterForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const emailInput = this.querySelector('input[type="email"]');
            const submitButton = this.querySelector('button[type="submit"]');
            let status = document.getElementById('newsletterStatus');
            if (!status) {
                status = document.createElement('p');
                status.id = 'newsletterStatus';
                status.className = 'newsletter-status';
                status.setAttribute('role', 'status');
                status.setAttribute('aria-live', 'polite');
                this.insertAdjacentElement('afterend', status);
            }

            if (!emailInput || !emailInput.checkValidity()) {
                emailInput?.reportValidity();
                status.textContent = 'Enter a valid email address.';
                status.classList.add('is-error');
                return;
            }

            if (!window.LuxeNewsletter || typeof window.LuxeNewsletter.subscribe !== 'function') {
                status.textContent = 'Subscriptions are unavailable right now. Please try again later.';
                status.classList.add('is-error');
                return;
            }

            const originalText = submitButton?.textContent || 'Join the list';
            if (submitButton) {
                submitButton.disabled = true;
                submitButton.textContent = 'Joining...';
            }
            status.textContent = '';
            status.classList.remove('is-error', 'is-success');

            try {
                const result = await window.LuxeNewsletter.subscribe(emailInput.value.trim());
                if (result?.error) throw result.error;
                this.reset();
                status.textContent = 'You are on the list. Please check your inbox for any required confirmation.';
                status.classList.add('is-success');
                showNotification('Newsletter subscription received.', 'mail');
            } catch (error) {
                console.warn('[ALKEBULAN] Newsletter subscription failed:', error?.message || error);
                status.textContent = 'We could not add you right now. Please try again later.';
                status.classList.add('is-error');
            } finally {
                if (submitButton) {
                    submitButton.disabled = false;
                    submitButton.textContent = originalText;
                }
            }
        });
    }
});

// ========== RENDER PRODUCTS (Home / Featured) ==========
function renderProducts(products, grid) {
    window.finishProductGridLoading?.(grid);
    let html = '';

    products.forEach(function(product, productIndex) {
        const productId = Number.parseInt(product.id, 10);
        if (!Number.isFinite(productId)) return;
        const safeName = escapeAppHtml(product.name || 'Product');
        const safeBrand = escapeAppHtml(product.brand || '');
        const safeCategory = escapeAppHtml(product.category || '');
        const safeSubcategory = escapeAppHtml(product.subcategory || '');
        const hasOptions = (Array.isArray(product.sizes) && product.sizes.length > 0)
            || (Array.isArray(product.colors) && product.colors.length > 0);

        html += `
            <article class="product-card" data-id="${productId}">
                <div class="product-image">
                    <img ${window.LuxeMedia.attributes(product.image, {
                        preset: 'card',
                        alt: product.name,
                        priority: productIndex === 0,
                    })}>
                    ${product.brand ? `<span class="brand-badge">${safeBrand}</span>` : ''}
                    ${product.discount && product.oldPrice ? `<span class="discount-badge">${Math.round((1 - product.price / product.oldPrice) * 100)}% OFF</span>` : ''}
                    ${product.trending ? `<span class="trending-badge"><i class="fas fa-fire" aria-hidden="true"></i> Trending</span>` : ''}
                    <div class="product-actions">
                        <button type="button" class="add-cart" data-id="${productId}" data-has-options="${hasOptions}" aria-label="${hasOptions ? 'Choose options for' : 'Add'} ${safeName}">
                            <i class="fas fa-shopping-bag" aria-hidden="true"></i> ${hasOptions ? 'Choose options' : 'Add'}
                        </button>
                        <button type="button" class="wishlist-btn" data-id="${productId}" aria-label="Save ${safeName} to wishlist" aria-pressed="false">
                            <i class="fas fa-heart" aria-hidden="true"></i>
                        </button>
                        <button type="button" class="quick-view" data-id="${productId}" aria-label="View ${safeName}">
                            <i class="fas fa-eye" aria-hidden="true"></i>
                        </button>
                    </div>
                </div>
                <div class="product-info">
                    ${product.brand ? `<div class="product-brand">${safeBrand}</div>` : ''}
                    <h4 class="product-name"><a class="product-name-link" href="product.html?id=${productId}" style="color:inherit;text-decoration:none">${safeName}</a></h4>
                    <p class="product-category">${safeCategory}${product.subcategory ? ' / ' + safeSubcategory : ''}</p>
                    <div class="product-price">
                        ${renderAppProductPrice(product)}
                    </div>
                    ${product.rating ? `
                        <div class="product-rating" aria-label="Rated ${Math.max(0, Math.min(5, Number(product.rating) || 0)).toFixed(1)} out of 5">
                            ${window.LuxeIcons?.rating(product.rating, 'stars') || ''}
                            <span class="rating-count">${product.reviewCount !== null && product.reviewCount !== undefined
                                ? `${Math.max(0, Number(product.reviewCount) || 0)} review${Number(product.reviewCount) === 1 ? '' : 's'}`
                                : `${Math.max(0, Math.min(5, Number(product.rating) || 0)).toFixed(1)} / 5`}</span>
                        </div>
                    ` : ''}
                </div>
            </article>
        `;
    });

    grid.innerHTML = html;
    window.LuxeMedia.hydrate(grid);
    window.syncWishlistButtons?.(grid);

    // ===== ATTACH EVENT LISTENERS =====
    grid.querySelectorAll('.product-card').forEach(function(card) {
        card.addEventListener('click', function(e) {
            if (e.target.closest('button, a')) return;
            var id = parseInt(this.dataset.id);
            window.location.href = 'product.html?id=' + id;
        });
    });

    // ===== ATTACH BUTTON EVENTS =====
    grid.querySelectorAll('.add-cart').forEach(function(btn) {
        btn.addEventListener('click', async function(e) {
            e.stopPropagation();
            var id = parseInt(this.dataset.id);
            if (this.dataset.hasOptions === 'true') {
                window.location.href = 'product.html?id=' + id;
                return;
            }
            var added = false;
            if (typeof addToCart === 'function') {
                added = await addToCart(id);
            } else if (typeof window.addToCart === 'function') {
                added = await window.addToCart(id);
            }
            if (added !== true) return;
            var original = this.innerHTML;
            this.innerHTML = '<i class="fas fa-check" aria-hidden="true"></i> Added!';
            this.style.background = '#27AE60';
            var self = this;
            setTimeout(function() {
                self.innerHTML = original;
                self.style.background = '';
            }, 1500);
        });
    });

    grid.querySelectorAll('.wishlist-btn').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            var id = parseInt(this.dataset.id);
            if (typeof toggleWishlist === 'function') {
                toggleWishlist(id, this);
            } else if (typeof window.toggleWishlist === 'function') {
                window.toggleWishlist(id, this);
            }
        });
    });

    grid.querySelectorAll('.quick-view').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            var id = parseInt(this.dataset.id);
            window.location.href = 'product.html?id=' + id;
        });
    });
}

// ========== NOTIFICATION TOAST ==========
function showNotification(message, type = 'check') {
    var existing = document.querySelector('.notification-toast');
    if (existing) {
        existing.remove();
    }

    var notification = document.createElement('div');
    notification.className = 'notification-toast';
    notification.setAttribute('role', 'status');
    notification.setAttribute('aria-live', 'polite');
    const icon = document.createElement('span');
    icon.className = 'notification-toast-icon';
    icon.innerHTML = window.LuxeIcons?.svg(type) || '';
    const text = document.createElement('span');
    text.textContent = message;
    notification.append(icon, text);
    document.body.appendChild(notification);
    setTimeout(function() {
        notification.style.opacity = '0';
        notification.style.transition = 'opacity 0.3s ease';
        setTimeout(function() {
            notification.remove();
        }, 300);
    }, 2000);
}

// Secret Keyboard Shortcut to Admin (Ctrl + Shift + A)
document.addEventListener('keydown', function(e) {
    if (e.ctrlKey && e.shiftKey && (e.key === 'A' || e.key === 'a')) {
        e.preventDefault();
        window.location.href = 'admin.html';
    }
});

// Expose globally
window.showNotification = showNotification;
