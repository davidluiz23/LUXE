// js/wishlist.js - Account-scoped wishlist management.

function getWishlistStorageKey() {
    const storedUser = localStorage.getItem('luxe_user');
    if (localStorage.getItem('luxe_logged_in') === 'true' && storedUser) {
        try {
            const user = JSON.parse(storedUser);
            if (user?.email) return `luxe_wishlist_${user.email}`;
        } catch { /* Use the guest key below. */ }
    }
    return 'luxe_wishlist';
}

function normalizeWishlist(values) {
    return [...new Set((Array.isArray(values) ? values : [])
        .map((id) => Number(id))
        .filter((id) => Number.isInteger(id) && id > 0))];
}

function loadWishlist() {
    try {
        if (localStorage.getItem('luxe_logged_in') !== 'true') return [];
        return normalizeWishlist(JSON.parse(localStorage.getItem(getWishlistStorageKey()) || '[]'));
    } catch (error) {
        console.error('Error loading wishlist:', error);
        return [];
    }
}

function saveWishlist(wishlist) {
    try {
        localStorage.setItem(getWishlistStorageKey(), JSON.stringify(normalizeWishlist(wishlist)));
        updateWishlistCount();
        syncWishlistButtons();
    } catch (error) {
        console.error('Error saving wishlist:', error);
    }
}

function wishlistProduct(productId) {
    const id = Number(productId);
    return window.getProductById?.(id)
        || (window.products || []).find((product) => Number(product.id) === id)
        || null;
}

function notifyWishlist(message) {
    if (typeof window.showNotification === 'function') window.showNotification(message, 'heart');
    else if (typeof window.alert === 'function') window.alert(message);
}

function syncWishlistButton(button, savedIds = loadWishlist()) {
    if (!(button instanceof HTMLElement)) return;
    const productId = Number(button.dataset.id);
    if (!Number.isInteger(productId) || productId <= 0) return;
    const saved = savedIds instanceof Set
        ? savedIds.has(productId)
        : normalizeWishlist(savedIds).includes(productId);
    const productName = wishlistProduct(productId)?.name || 'this product';
    button.classList.toggle('is-saved', saved);
    button.setAttribute('aria-pressed', String(saved));
    button.setAttribute(
        'aria-label',
        saved ? `Remove ${productName} from wishlist` : `Save ${productName} to wishlist`,
    );
    button.style.color = saved ? '#E74C3C' : '';
}

function syncWishlistButtons(root = document, wishlist = loadWishlist()) {
    const scope = root?.querySelectorAll ? root : document;
    const savedIds = new Set(normalizeWishlist(wishlist));
    scope.querySelectorAll('.wishlist-btn[data-id], .wishlist-btn-product[data-id]')
        .forEach((button) => syncWishlistButton(button, savedIds));
}

function requireWishlistLogin() {
    if (localStorage.getItem('luxe_logged_in') === 'true') return true;
    if (typeof window.showNotification === 'function') {
        window.showNotification('Please sign in or create an account to save wishlist items.', 'lock');
    } else {
        window.alert?.('Please sign in or create an account to save wishlist items.');
    }
    setTimeout(() => { window.location.href = 'login.html'; }, 1500);
    return false;
}

function addToWishlist(productId) {
    const id = Number(productId);
    if (!requireWishlistLogin()) return false;
    if (!Number.isInteger(id) || id <= 0 || !wishlistProduct(id)) {
        notifyWishlist('This product is not available.');
        return false;
    }
    const wishlist = loadWishlist();
    if (wishlist.includes(id)) return false;
    wishlist.push(id);
    saveWishlist(wishlist);
    notifyWishlist('Added to wishlist.');
    return true;
}

function removeFromWishlist(productId) {
    const id = Number(productId);
    saveWishlist(loadWishlist().filter((savedId) => savedId !== id));
    notifyWishlist('Removed from wishlist.');
    if (document.getElementById('wishlistGrid')) renderWishlistPage();
}

function toggleWishlist(productId, button) {
    const id = Number(productId);
    if (!requireWishlistLogin()) return false;
    if (!Number.isInteger(id) || id <= 0 || !wishlistProduct(id)) return false;
    const wishlist = loadWishlist();
    const index = wishlist.indexOf(id);
    const isAdding = index === -1;
    if (isAdding) wishlist.push(id);
    else wishlist.splice(index, 1);
    saveWishlist(wishlist);
    if (button) syncWishlistButton(button, new Set(wishlist));
    notifyWishlist(isAdding ? 'Added to wishlist.' : 'Removed from wishlist.');
    if (!isAdding && document.getElementById('wishlistGrid')) renderWishlistPage();
    return isAdding;
}

function updateWishlistCount() {
    const count = loadWishlist().length;
    document.querySelectorAll('.wishlist-count').forEach((badge) => {
        const isHeading = badge.tagName === 'SPAN'
            && badge.parentElement?.classList.contains('wishlist-header');
        badge.textContent = isHeading ? `${count} item${count === 1 ? '' : 's'}` : String(count);
    });
}

function escapeWishlistHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[character]);
}

function wishlistMoney(product, oldPrice = false) {
    const fallbackValue = oldPrice ? product?.oldPrice : product?.price;
    const formatted = window.LuxeMoney?.forProduct?.(product, oldPrice) || {
        usd: fallbackValue === null || fallbackValue === undefined || fallbackValue === ''
            ? ''
            : `$${Number(fallbackValue).toFixed(2)}`,
        ngn: '',
    };
    return {
        usd: escapeWishlistHtml(formatted.usd || ''),
        ngn: escapeWishlistHtml(formatted.ngn || ''),
    };
}

function renderWishlistPage() {
    const container = document.getElementById('wishlistGrid');
    if (!container) return;

    const saved = loadWishlist();
    const wishlist = saved.filter((id) => !!wishlistProduct(id));
    if (wishlist.length !== saved.length
        && ['ready', 'empty', 'offline'].includes(window.LuxeCatalogStatus?.state)) {
        saveWishlist(wishlist);
    }
    updateWishlistCount();

    if (!wishlist.length) {
        const unavailable = saved.length > 0 && window.LuxeCatalogStatus?.state === 'unavailable';
        container.innerHTML = `
            <div class="empty-wishlist">
                <i class="fas fa-heart" aria-hidden="true"></i>
                <h3>${unavailable ? 'Saved pieces are temporarily unavailable' : 'Your wishlist is empty'}</h3>
                <p>${unavailable ? 'The live catalog could not be verified. Please try again shortly.' : 'Save pieces you love by selecting the heart button on a product.'}</p>
                <a href="${unavailable ? window.location.href : 'shop.html'}" class="btn btn-primary">${unavailable ? 'Try again' : 'Explore products'}</a>
            </div>`;
        return;
    }

    container.innerHTML = wishlist.map((id) => {
        const product = wishlistProduct(id);
        if (!product) return '';
        const productId = Number(product.id);
        const safeName = escapeWishlistHtml(product.name || 'Product');
        const safeBrand = escapeWishlistHtml(product.brand || '');
        const safeCategory = escapeWishlistHtml(product.category || '');
        const safeSubcategory = escapeWishlistHtml(product.subcategory || '');
        const money = wishlistMoney(product);
        const oldMoney = wishlistMoney(product, true);
        const hasOptions = (Array.isArray(product.sizes) && product.sizes.length > 0)
            || (Array.isArray(product.colors) && product.colors.length > 0);
        return `
            <article class="wishlist-item" data-id="${productId}">
                <div class="product-image">
                    <img ${window.LuxeMedia.attributes(product.image, { preset: 'card', alt: product.name })}>
                    ${product.brand ? `<span class="wishlist-badge">${safeBrand}</span>` : ''}
                    <div class="product-actions">
                        <button type="button" class="add-cart" data-action="add" data-has-options="${hasOptions}" aria-label="${hasOptions ? 'Choose options for' : 'Add'} ${safeName}">
                            <i class="fas fa-shopping-bag" aria-hidden="true"></i> ${hasOptions ? 'Choose options' : 'Add to cart'}
                        </button>
                        <button type="button" class="remove-wishlist" data-action="remove" aria-label="Remove ${safeName} from wishlist">
                            <i class="fas fa-trash-alt" aria-hidden="true"></i>
                        </button>
                    </div>
                </div>
                <div class="product-info">
                    ${product.brand ? `<div class="product-brand">${safeBrand}</div>` : ''}
                    <h4 class="product-name"><a class="product-name-link" href="product.html?id=${productId}" style="color:inherit;text-decoration:none">${safeName}</a></h4>
                    <p class="product-category">${safeCategory}${product.subcategory ? ` / ${safeSubcategory}` : ''}</p>
                    <div class="product-price">
                        <span class="product-current-price">${money.ngn || money.usd}</span>
                        ${money.ngn && money.usd ? `<span class="product-price-secondary">${money.usd}</span>` : ''}
                        ${oldMoney.ngn || oldMoney.usd ? `<span class="old-price">${oldMoney.ngn || oldMoney.usd}</span>` : ''}
                    </div>
                </div>
            </article>`;
    }).join('');
    window.LuxeMedia.hydrate(container);

    container.querySelectorAll('.wishlist-item').forEach((card) => {
        const open = () => { window.location.href = `product.html?id=${Number(card.dataset.id)}`; };
        card.addEventListener('click', (event) => {
            const action = event.target.closest('[data-action]');
            if (!action) {
                if (!event.target.closest('a')) open();
                return;
            }
            event.stopPropagation();
            if (action.dataset.action === 'remove') window.removeFromWishlist(Number(card.dataset.id));
            if (action.dataset.action === 'add') {
                if (action.dataset.hasOptions === 'true') open();
                else window.addToCart?.(Number(card.dataset.id));
            }
        });
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    updateWishlistCount();
    syncWishlistButtons();
    if (document.getElementById('wishlistGrid')) {
        if (window.productsReady) await window.productsReady;
        renderWishlistPage();
    }
});

window.loadWishlist = loadWishlist;
window.saveWishlist = saveWishlist;
window.addToWishlist = addToWishlist;
window.removeFromWishlist = removeFromWishlist;
window.toggleWishlist = toggleWishlist;
window.updateWishlistCount = updateWishlistCount;
window.syncWishlistButton = syncWishlistButton;
window.syncWishlistButtons = syncWishlistButtons;
window.renderWishlistPage = renderWishlistPage;
