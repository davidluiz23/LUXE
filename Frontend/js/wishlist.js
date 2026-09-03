// js/wishlist.js - Account-scoped wishlist management.

const WISHLIST_INTENT_STORAGE_KEY = 'luxe_pending_wishlist_intent';
const WISHLIST_INTENT_MAX_AGE_MS = 30 * 60 * 1000;
const ACCOUNT_WISHLIST_STORAGE_PREFIX = 'luxe_wishlist_user_';
let wishlistLoginRedirectTimer = null;

function isWishlistUserLoggedIn() {
    try {
        return localStorage.getItem('luxe_logged_in') === 'true';
    } catch {
        return false;
    }
}

function safeWishlistReturnPath(value, productId) {
    const fallback = `product.html?id=${encodeURIComponent(Number(productId))}`;
    try {
        const directory = new URL('./', window.location.href);
        const target = new URL(String(value || fallback).slice(0, 600), directory);
        const filename = target.pathname.split('/').pop() || 'index.html';
        const blockedPages = new Set([
            'admin.html',
            'auth-callback.html',
            'login.html',
            'reset-password.html',
            'signup.html',
            'verify-signup.html',
        ]);
        if (target.origin !== directory.origin
            || !target.pathname.startsWith(directory.pathname)
            || !/^[a-z0-9-]+\.html$/i.test(filename)
            || blockedPages.has(filename.toLowerCase())) {
            return fallback;
        }
        return `${filename}${target.search}${target.hash}`;
    } catch {
        return fallback;
    }
}

function wishlistIntentStores() {
    const stores = [];
    try { if (window.sessionStorage) stores.push(window.sessionStorage); } catch { /* Unavailable in some privacy modes. */ }
    try { if (window.localStorage) stores.push(window.localStorage); } catch { /* Unavailable in some privacy modes. */ }
    return stores;
}

function rememberWishlistIntent(productId, returnPath = window.location.href) {
    const id = Number(productId);
    if (!Number.isInteger(id) || id <= 0) return null;
    const intent = {
        productId: id,
        returnTo: safeWishlistReturnPath(returnPath, id),
        createdAt: Date.now(),
    };
    const serialized = JSON.stringify(intent);
    let stored = false;
    wishlistIntentStores().forEach((storage) => {
        try {
            storage.setItem(WISHLIST_INTENT_STORAGE_KEY, serialized);
            stored = true;
        } catch { /* The encoded login URL still preserves visible intent. */ }
    });
    return stored ? intent : null;
}

function clearWishlistIntent() {
    wishlistIntentStores().forEach((storage) => {
        try { storage.removeItem(WISHLIST_INTENT_STORAGE_KEY); } catch { /* Best effort. */ }
    });
}

function readWishlistIntent() {
    for (const storage of wishlistIntentStores()) {
        try {
            const value = storage.getItem(WISHLIST_INTENT_STORAGE_KEY);
            if (!value) continue;
            const parsed = JSON.parse(value);
            const id = Number(parsed?.productId);
            const createdAt = Number(parsed?.createdAt);
            if (!Number.isInteger(id) || id <= 0
                || !Number.isFinite(createdAt)
                || createdAt > Date.now() + 60 * 1000
                || Date.now() - createdAt > WISHLIST_INTENT_MAX_AGE_MS) {
                continue;
            }
            return {
                productId: id,
                returnTo: safeWishlistReturnPath(parsed.returnTo, id),
                createdAt,
            };
        } catch { /* Try the fallback store. */ }
    }
    clearWishlistIntent();
    return null;
}

function captureWishlistIntentFromLoginUrl() {
    try {
        const query = new URLSearchParams(window.location.search);
        if (query.get('return') !== 'wishlist') return;
        const id = Number(query.get('product'));
        if (!Number.isInteger(id) || id <= 0) return;
        rememberWishlistIntent(id, query.get('wishlistReturn') || `product.html?id=${id}`);
    } catch { /* Ignore malformed or unavailable URL state. */ }
}

function canonicalWishlistEmail(value) {
    return String(value || '').trim().toLocaleLowerCase();
}

function cachedWishlistUser() {
    try {
        if (!isWishlistUserLoggedIn()) return null;
        const user = JSON.parse(localStorage.getItem('luxe_user') || 'null');
        return user && typeof user === 'object' ? user : null;
    } catch {
        return null;
    }
}

function wishlistStorageKeyForUser(user) {
    const userId = String(user?.id || '').trim();
    if (userId) return `${ACCOUNT_WISHLIST_STORAGE_PREFIX}${encodeURIComponent(userId)}`;
    const email = canonicalWishlistEmail(user?.email);
    return email ? `luxe_wishlist_${email}` : '';
}

function migrateLegacyWishlist(user, accountKey) {
    const email = String(user?.email || '').trim();
    const legacyKeys = new Set([
        email ? `luxe_wishlist_${email}` : '',
        canonicalWishlistEmail(email) ? `luxe_wishlist_${canonicalWishlistEmail(email)}` : '',
    ]);
    legacyKeys.delete('');
    legacyKeys.delete(accountKey);

    try {
        const sourceKeys = [...legacyKeys].filter((key) => localStorage.getItem(key) !== null);
        if (!sourceKeys.length) return false;
        const accountWishlist = normalizeWishlist(
            JSON.parse(localStorage.getItem(accountKey) || '[]'),
        );
        const legacyWishlist = sourceKeys.flatMap((key) =>
            normalizeWishlist(JSON.parse(localStorage.getItem(key) || '[]')),
        );
        localStorage.setItem(
            accountKey,
            JSON.stringify(normalizeWishlist([...accountWishlist, ...legacyWishlist])),
        );
        sourceKeys.forEach((key) => localStorage.removeItem(key));
        return true;
    } catch (error) {
        console.error('Error migrating legacy wishlist:', error);
        return false;
    }
}

function getWishlistStorageKey(user = null) {
    const accountUser = user || cachedWishlistUser();
    const accountKey = wishlistStorageKeyForUser(accountUser);
    if (!accountKey) return 'luxe_wishlist';
    migrateLegacyWishlist(accountUser, accountKey);
    return accountKey;
}

function normalizeWishlist(values) {
    return [...new Set((Array.isArray(values) ? values : [])
        .map((id) => Number(id))
        .filter((id) => Number.isInteger(id) && id > 0))];
}

function loadWishlist(storageKey = '') {
    try {
        if (!storageKey && localStorage.getItem('luxe_logged_in') !== 'true') return [];
        return normalizeWishlist(JSON.parse(localStorage.getItem(storageKey || getWishlistStorageKey()) || '[]'));
    } catch (error) {
        console.error('Error loading wishlist:', error);
        return [];
    }
}

function saveWishlist(wishlist, storageKey = '') {
    const normalized = normalizeWishlist(wishlist);
    try {
        localStorage.setItem(storageKey || getWishlistStorageKey(), JSON.stringify(normalized));
    } catch (error) {
        console.error('Error saving wishlist:', error);
        return false;
    }
    updateWishlistCount(normalized);
    syncWishlistButtons(document, normalized);
    return true;
}

function wishlistProduct(productId) {
    const id = Number(productId);
    return window.getProductById?.(id)
        || (window.products || []).find((product) => Number(product.id) === id)
        || null;
}

function notifyWishlist(message, icon = 'heart') {
    if (typeof window.showNotification === 'function') window.showNotification(message, icon);
    else if (typeof window.alert === 'function') window.alert(message);
}

function notifyWishlistSaveFailure() {
    notifyWishlist('We could not save your wishlist in this browser. Please check your storage settings and try again.', 'box');
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

function requireWishlistLogin(productId) {
    if (isWishlistUserLoggedIn()) return true;
    const id = Number(productId);
    const intent = rememberWishlistIntent(id);
    const returnTo = intent?.returnTo || safeWishlistReturnPath(window.location.href, id);
    if (typeof window.showNotification === 'function') {
        window.showNotification('Please sign in or create an account to save wishlist items.', 'lock');
    } else {
        window.alert?.('Please sign in or create an account to save wishlist items.');
    }
    const loginUrl = new URL('login.html', window.location.href);
    loginUrl.searchParams.set('return', 'wishlist');
    loginUrl.searchParams.set('product', String(id));
    loginUrl.searchParams.set('wishlistReturn', returnTo);
    if (wishlistLoginRedirectTimer) window.clearTimeout(wishlistLoginRedirectTimer);
    wishlistLoginRedirectTimer = window.setTimeout(() => {
        window.location.href = loginUrl.toString();
    }, 2000);
    return false;
}

function addToWishlist(productId) {
    const id = Number(productId);
    if (!Number.isInteger(id) || id <= 0 || !wishlistProduct(id)) {
        notifyWishlist('This product is not available.');
        return false;
    }
    if (!requireWishlistLogin(id)) return false;
    const wishlist = loadWishlist();
    if (wishlist.includes(id)) return false;
    wishlist.push(id);
    if (!saveWishlist(wishlist)) {
        notifyWishlistSaveFailure();
        return false;
    }
    notifyWishlist('Added to wishlist.');
    return true;
}

function removeFromWishlist(productId) {
    const id = Number(productId);
    const wishlist = loadWishlist();
    if (!wishlist.includes(id)) return false;
    if (!saveWishlist(wishlist.filter((savedId) => savedId !== id))) {
        notifyWishlistSaveFailure();
        return false;
    }
    notifyWishlist('Removed from wishlist.');
    if (document.getElementById('wishlistGrid')) renderWishlistPage();
    return true;
}

function toggleWishlist(productId, button) {
    const id = Number(productId);
    if (!Number.isInteger(id) || id <= 0 || !wishlistProduct(id)) return false;
    if (!requireWishlistLogin(id)) return false;
    const wishlist = loadWishlist();
    const index = wishlist.indexOf(id);
    const isAdding = index === -1;
    if (isAdding) wishlist.push(id);
    else wishlist.splice(index, 1);
    if (!saveWishlist(wishlist)) {
        notifyWishlistSaveFailure();
        return false;
    }
    if (button) syncWishlistButton(button, new Set(wishlist));
    notifyWishlist(isAdding ? 'Added to wishlist.' : 'Removed from wishlist.');
    if (!isAdding && document.getElementById('wishlistGrid')) renderWishlistPage();
    return isAdding;
}

async function restorePendingWishlistIntent() {
    const intent = readWishlistIntent();
    if (!intent) return false;

    let accountStorageKey = '';
    let authSessionChecked = false;
    if (window.LuxeAuth?.isReady?.() && typeof window.LuxeAuth.getCurrentUser === 'function') {
        try {
            authSessionChecked = true;
            const user = await window.LuxeAuth.getCurrentUser();
            if (user?.id || user?.email) accountStorageKey = getWishlistStorageKey(user);
        } catch { /* Fall back to the cached storefront identity below. */ }
    }
    if (!accountStorageKey && !authSessionChecked && isWishlistUserLoggedIn()) {
        accountStorageKey = getWishlistStorageKey();
    }
    if (!accountStorageKey || accountStorageKey === 'luxe_wishlist') return false;

    if (window.productsReady) {
        try { await window.productsReady; } catch { /* Catalog status below decides whether to retain intent. */ }
    }

    if (!wishlistProduct(intent.productId)) {
        if (['ready', 'empty', 'offline'].includes(window.LuxeCatalogStatus?.state)) {
            clearWishlistIntent();
            notifyWishlist('The requested product is no longer available.', 'box');
        }
        return false;
    }

    const wishlist = loadWishlist(accountStorageKey);
    const alreadySaved = wishlist.includes(intent.productId);
    if (!alreadySaved) {
        wishlist.push(intent.productId);
        if (!saveWishlist(wishlist, accountStorageKey)) {
            notifyWishlistSaveFailure();
            return false;
        }
        notifyWishlist('Saved to your wishlist after sign-in.');
    }

    clearWishlistIntent();
    const currentPath = safeWishlistReturnPath(window.location.href, intent.productId);
    if (intent.returnTo !== currentPath) {
        window.setTimeout(() => { window.location.href = intent.returnTo; }, 800);
    }
    return true;
}

function updateWishlistCount(wishlist = loadWishlist()) {
    const count = normalizeWishlist(wishlist).length;
    document.querySelectorAll('.wishlist-count').forEach((badge) => {
        const isHeading = badge.tagName === 'SPAN'
            && badge.parentElement?.classList.contains('wishlist-header');
        badge.textContent = isHeading ? `${count} item${count === 1 ? '' : 's'}` : String(count);
    });
}

function escapeWishlistHtml(value) { return window.LuxeUtils.escapeHtml(value); }

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

captureWishlistIntentFromLoginUrl();

document.addEventListener('DOMContentLoaded', async () => {
    updateWishlistCount();
    syncWishlistButtons();
    const pendingRestore = restorePendingWishlistIntent();
    if (document.getElementById('wishlistGrid')) {
        if (window.productsReady) await window.productsReady;
        await pendingRestore;
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
