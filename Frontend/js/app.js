// js/app.js - Main Application Script

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
        newsletterForm.addEventListener('submit', function(e) {
            e.preventDefault();
            showNotification('Thank you for subscribing.', 'mail');
            this.reset();
        });
    }
});

// ========== RENDER PRODUCTS (Home / Featured) ==========
function renderProducts(products, grid) {
    window.finishProductGridLoading?.(grid);
    let html = '';
    const wishlist = (typeof loadWishlist === 'function') ? loadWishlist() : [];

    products.forEach(function(product, productIndex) {
        const inWishlist = wishlist.includes(product.id);
        const heartColor = inWishlist ? 'style="color:#E74C3C;"' : '';

        html += `
            <div class="product-card" data-id="${product.id}">
                <div class="product-image">
                    <img ${window.LuxeMedia.attributes(product.image, {
                        preset: 'card',
                        alt: product.name,
                        priority: productIndex === 0,
                    })}>
                    ${product.brand ? `<span class="brand-badge">${product.brand}</span>` : ''}
                    ${product.discount && product.oldPrice ? `<span class="discount-badge">${Math.round((1 - product.price / product.oldPrice) * 100)}% OFF</span>` : ''}
                    ${product.trending ? `<span class="trending-badge"><i class="fas fa-fire"></i> Trending</span>` : ''}
                    <div class="product-actions">
                        <button class="add-cart" data-id="${product.id}">
                            <i class="fas fa-shopping-bag"></i> Add
                        </button>
                        <button class="wishlist-btn" data-id="${product.id}" ${heartColor}>
                            <i class="fas fa-heart"></i>
                        </button>
                        <button class="quick-view" data-id="${product.id}">
                            <i class="fas fa-eye"></i>
                        </button>
                    </div>
                </div>
                <div class="product-info">
                    ${product.brand ? `<div class="product-brand">${product.brand}</div>` : ''}
                    <h4 class="product-name">${product.name}</h4>
                    <p class="product-category">${product.category}${product.subcategory ? ' / ' + product.subcategory : ''}</p>
                    <div class="product-price">
                        $${product.price.toFixed(2)}
                        ${product.oldPrice ? `<span class="old-price">$${product.oldPrice.toFixed(2)}</span>` : ''}
                    </div>
                    ${product.rating ? `
                        <div class="product-rating">
                            ${window.LuxeIcons?.rating(product.rating, 'stars') || ''}
                            <span class="rating-count">(${product.rating})</span>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    });

    grid.innerHTML = html;
    window.LuxeMedia.hydrate(grid);

    // ===== ATTACH EVENT LISTENERS =====
    document.querySelectorAll('.product-card').forEach(function(card) {
        card.addEventListener('click', function(e) {
            if (e.target.closest('button')) return;
            var id = parseInt(this.dataset.id);
            window.location.href = 'product.html?id=' + id;
        });
    });

    // ===== ATTACH BUTTON EVENTS =====
    document.querySelectorAll('.add-cart').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            var id = parseInt(this.dataset.id);
            if (typeof addToCart === 'function') {
                addToCart(id);
            } else if (typeof window.addToCart === 'function') {
                window.addToCart(id);
            }
            var original = this.innerHTML;
            this.innerHTML = '<i class="fas fa-check"></i> Added!';
            this.style.background = '#27AE60';
            var self = this;
            setTimeout(function() {
                self.innerHTML = original;
                self.style.background = '';
            }, 1500);
        });
    });

    document.querySelectorAll('.wishlist-btn').forEach(function(btn) {
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

    document.querySelectorAll('.quick-view').forEach(function(btn) {
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
