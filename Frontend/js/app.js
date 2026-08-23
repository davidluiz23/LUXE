// js/app.js - Main Application Script

document.addEventListener('DOMContentLoaded', async function() {
    // Wait for the live product catalog (Supabase) to finish loading
    // before rendering, so we don't flash the offline fallback list.
    if (window.productsReady) await window.productsReady;
    // Hide loader
    const loader = document.getElementById('loader');
    if (loader) {
        setTimeout(function() {
            loader.style.display = 'none';
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
    const productGrid = document.getElementById('productGrid');
    if (productGrid) {
        const getFeatured = (typeof getFeaturedProducts === 'function') ? getFeaturedProducts : (window.getFeaturedProducts || function() { return (window.products || []).slice(0, 8); });
        const products = getFeatured();
        if (products && products.length > 0) {
            renderProducts(products, productGrid);
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
    let html = '';
    
    products.forEach(function(product) {
        const wishlist = (typeof loadWishlist === 'function') ? loadWishlist() : [];
        const inWishlist = wishlist.includes(product.id);
        const heartColor = inWishlist ? 'style="color:#E74C3C;"' : '';

        // Build images
        let imagesHtml = '';
        const allImages = [product.image];
        if (product.hoverImage) {
            allImages.push(product.hoverImage);
        }
        if (product.hoverImages && product.hoverImages.length > 0) {
            product.hoverImages.forEach(function(img) {
                if (!allImages.includes(img)) allImages.push(img);
            });
        }

        imagesHtml = allImages.map(function(img, index) {
            const active = index === 0 ? 'active' : '';
            return `<img src="${img}" alt="${product.name}" class="carousel-img ${active}" data-index="${index}">`;
        }).join('');

        // Build dots
        let dotsHtml = '';
        if (allImages.length > 1) {
            dotsHtml = '<div class="carousel-dots">';
            allImages.forEach(function(_, index) {
                const active = index === 0 ? 'active' : '';
                dotsHtml += `<span class="dot ${active}" data-index="${index}"></span>`;
            });
            dotsHtml += '</div>';
        }

        html += `
            <div class="product-card" data-id="${product.id}">
                <div class="product-image">
                    <img src="${product.image}" alt="${product.name}">
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
