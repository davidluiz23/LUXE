// js/wishlist.js - Comprehensive Wishlist Management

function getWishlistStorageKey() {
    const isLoggedIn = localStorage.getItem('luxe_logged_in') === 'true';
    const storedUser = localStorage.getItem('luxe_user');
    if (isLoggedIn && storedUser) {
        try {
            const user = JSON.parse(storedUser);
            if (user && user.email) {
                return `luxe_wishlist_${user.email}`;
            }
        } catch (e) {}
    }
    return 'luxe_wishlist';
}

function loadWishlist() {
    try {
        const isLoggedIn = localStorage.getItem('luxe_logged_in') === 'true';
        if (!isLoggedIn) return []; // Return empty array if not logged in

        const key = getWishlistStorageKey();
        const stored = localStorage.getItem(key);
        return stored ? JSON.parse(stored) : [];
    } catch (e) {
        console.error('Error loading wishlist:', e);
        return [];
    }
}

function saveWishlist(wishlist) {
    try {
        const key = getWishlistStorageKey();
        localStorage.setItem(key, JSON.stringify(wishlist));
        updateWishlistCount();
    } catch (e) {
        console.error('Error saving wishlist:', e);
    }
}

function addToWishlist(productId) {
    const isLoggedIn = localStorage.getItem('luxe_logged_in') === 'true';
    if (!isLoggedIn) {
        if (typeof showNotification === 'function') {
            showNotification('Please log in or create an account to save wishlist items! 🔒');
        } else {
            alert('Please log in or create an account to save wishlist items!');
        }
        setTimeout(() => {
            window.location.href = 'login.html';
        }, 1500);
        return false;
    }

    const wishlist = loadWishlist();
    if (!wishlist.includes(productId)) {
        wishlist.push(productId);
        saveWishlist(wishlist);
        if (typeof showNotification === 'function') {
            showNotification('Added to wishlist ❤️');
        }
        return true;
    }
    return false;
}

function removeFromWishlist(productId) {
    let wishlist = loadWishlist();
    wishlist = wishlist.filter(id => id !== productId);
    saveWishlist(wishlist);
    if (typeof showNotification === 'function') {
        showNotification('Removed from wishlist 💔');
    }
    if (document.getElementById('wishlistGrid')) {
        renderWishlistPage();
    }
}

function toggleWishlist(productId, button) {
    const isLoggedIn = localStorage.getItem('luxe_logged_in') === 'true';
    if (!isLoggedIn) {
        if (typeof showNotification === 'function') {
            showNotification('Please log in or create an account to save wishlist items! 🔒');
        } else {
            alert('Please log in or create an account to save wishlist items!');
        }
        setTimeout(() => {
            window.location.href = 'login.html';
        }, 1500);
        return false;
    }

    const wishlist = loadWishlist();
    const index = wishlist.indexOf(productId);
    
    if (index === -1) {
        wishlist.push(productId);
        saveWishlist(wishlist);
        if (button) {
            button.style.color = '#E74C3C';
            button.style.background = '#FFEBEE';
        }
        if (typeof showNotification === 'function') {
            showNotification('Added to wishlist ❤️');
        }
    } else {
        wishlist.splice(index, 1);
        saveWishlist(wishlist);
        if (button) {
            button.style.color = '';
            button.style.background = '';
        }
        if (typeof showNotification === 'function') {
            showNotification('Removed from wishlist 💔');
        }
        if (document.getElementById('wishlistGrid')) {
            renderWishlistPage();
        }
    }
}

function updateWishlistCount() {
    const wishlist = loadWishlist();
    document.querySelectorAll('.wishlist-count').forEach(badge => {
        if (badge) {
            if (badge.tagName === 'SPAN' && badge.classList.contains('wishlist-count') && badge.parentElement.classList.contains('wishlist-header')) {
                badge.textContent = `${wishlist.length} item${wishlist.length === 1 ? '' : 's'}`;
            } else {
                badge.textContent = wishlist.length;
            }
        }
    });
}

function renderWishlistPage() {
    const container = document.getElementById('wishlistGrid');
    if (!container) return;

    const wishlist = loadWishlist();
    updateWishlistCount();

    if (wishlist.length === 0) {
        container.innerHTML = `
            <div class="empty-wishlist">
                <i class="fas fa-heart"></i>
                <h3>Your wishlist is empty</h3>
                <p>Save items you love by clicking the heart icon on products.</p>
                <a href="shop.html" class="btn btn-primary">Explore Products</a>
            </div>
        `;
        return;
    }

    let html = '';
    wishlist.forEach(id => {
        const product = (typeof getProductById === 'function') ? getProductById(id) : ((window.products || []).find(p => p.id === id));
        if (!product) return;

        html += `
            <div class="wishlist-item" data-id="${product.id}" onclick="window.location.href='product.html?id=${product.id}'">
                <div class="product-image">
                    <img src="${product.image}" alt="${product.name}">
                    ${product.brand ? `<span class="wishlist-badge">${product.brand}</span>` : ''}
                    <div class="product-actions">
                        <button class="add-cart" onclick="event.stopPropagation(); window.addToCart(${product.id})">
                            <i class="fas fa-shopping-bag"></i> Add to Cart
                        </button>
                        <button class="remove-wishlist" onclick="event.stopPropagation(); window.removeFromWishlist(${product.id})" title="Remove">
                            <i class="fas fa-trash-alt"></i>
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
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

document.addEventListener('DOMContentLoaded', () => {
    updateWishlistCount();
    if (document.getElementById('wishlistGrid')) {
        renderWishlistPage();
    }
});

// Expose functions globally
window.loadWishlist = loadWishlist;
window.saveWishlist = saveWishlist;
window.addToWishlist = addToWishlist;
window.removeFromWishlist = removeFromWishlist;
window.toggleWishlist = toggleWishlist;
window.updateWishlistCount = updateWishlistCount;
window.renderWishlistPage = renderWishlistPage;