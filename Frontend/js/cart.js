// js/cart.js - Variant-aware cart management

const CART_MAX_QUANTITY = 99;
let cartQuoteGeneration = 0;

function getCartStorageKey() {
    const isLoggedIn = localStorage.getItem('luxe_logged_in') === 'true';
    const storedUser = localStorage.getItem('luxe_user');
    if (isLoggedIn && storedUser) {
        try {
            const user = JSON.parse(storedUser);
            if (user?.email) return `luxe_cart_${user.email}`;
        } catch { /* Fall back to the guest key below. */ }
    }
    return 'luxe_cart';
}

function normalizeCartOption(value) {
    return String(value || '').trim().slice(0, 80);
}

function getCartItemKey(itemOrId, options = {}) {
    const item = typeof itemOrId === 'object'
        ? itemOrId
        : { id: itemOrId, size: options.size, color: options.color };
    const id = Number(item?.id);
    return `${Number.isInteger(id) ? id : 0}::${encodeURIComponent(normalizeCartOption(item?.size))}::${encodeURIComponent(normalizeCartOption(item?.color))}`;
}

function normalizeCartItem(item) {
    const id = Number(item?.id ?? item?.product_id);
    const quantity = Math.min(CART_MAX_QUANTITY, Math.max(1, Math.trunc(Number(item?.quantity) || 1)));
    if (!Number.isInteger(id) || id <= 0) return null;
    const normalized = {
        id,
        quantity,
        size: normalizeCartOption(item?.size ?? item?.selected_size),
        color: normalizeCartOption(item?.color ?? item?.selected_color),
    };
    normalized.key = getCartItemKey(normalized);
    return normalized;
}

function normalizeCart(cart) {
    if (!Array.isArray(cart)) return [];
    const merged = new Map();
    cart.forEach((rawItem) => {
        const item = normalizeCartItem(rawItem);
        if (!item) return;
        const existing = merged.get(item.key);
        if (existing) existing.quantity = Math.min(CART_MAX_QUANTITY, existing.quantity + item.quantity);
        else merged.set(item.key, item);
    });
    return [...merged.values()];
}

function loadCart() {
    try {
        if (localStorage.getItem('luxe_logged_in') !== 'true') return [];
        const stored = localStorage.getItem(getCartStorageKey());
        return normalizeCart(stored ? JSON.parse(stored) : []);
    } catch (error) {
        console.error('Error loading cart:', error);
        return [];
    }
}

function saveCart(cart) {
    try {
        localStorage.setItem(getCartStorageKey(), JSON.stringify(normalizeCart(cart)));
        updateCartCount();
    } catch (error) {
        console.error('Error saving cart:', error);
    }
}

function cartProduct(productId) {
    return typeof window.getProductById === 'function'
        ? window.getProductById(productId)
        : (window.products || []).find((product) => Number(product.id) === Number(productId));
}

function resolveCartOptions(product, item = {}) {
    const choose = (candidate, available) => {
        const values = Array.isArray(available) ? available.map(normalizeCartOption).filter(Boolean) : [];
        const requested = normalizeCartOption(candidate);
        if (!values.length) return { value: '', valid: !requested, required: false };
        if (!requested) return { value: '', valid: false, required: true };
        const match = values.find((value) => value.toLocaleLowerCase() === requested.toLocaleLowerCase());
        return { value: match || '', valid: !!match, required: true };
    };
    const size = choose(item.size, product?.sizes);
    const color = choose(item.color, product?.colors);
    return {
        size: size.value,
        color: color.value,
        valid: size.valid && color.valid,
        missing: [size.required && !size.valid ? 'size' : '', color.required && !color.valid ? 'color' : ''].filter(Boolean),
    };
}

function catalogCanConfirmStaleItems() {
    return ['ready', 'empty', 'offline'].includes(window.LuxeCatalogStatus?.state);
}

function reconcileCart({ purge = true } = {}) {
    const storedItems = loadCart();
    const available = [];
    const stale = [];
    const quantitiesByProduct = new Map();
    let changed = false;
    storedItems.forEach((item) => {
        const product = cartProduct(item.id);
        if (!product) {
            stale.push(item);
            return;
        }
        const options = resolveCartOptions(product, item);
        if (!options.valid || product.inStock === false) {
            stale.push(item);
            return;
        }
        const stock = Number(product.stockQuantity);
        const stockLimit = Number.isInteger(stock) ? Math.max(0, Math.min(CART_MAX_QUANTITY, stock)) : CART_MAX_QUANTITY;
        const alreadyAllocated = quantitiesByProduct.get(item.id) || 0;
        const availableForLine = Math.max(0, stockLimit - alreadyAllocated);
        if (availableForLine < 1) {
            stale.push(item);
            return;
        }
        const resolved = normalizeCartItem({
            ...item,
            ...options,
            quantity: Math.min(item.quantity, availableForLine, CART_MAX_QUANTITY),
        });
        if (!resolved) return;
        if (resolved.key !== item.key || resolved.quantity !== item.quantity) changed = true;
        available.push(resolved);
        quantitiesByProduct.set(item.id, alreadyAllocated + resolved.quantity);
    });
    const normalizedAvailable = normalizeCart(available);
    if (purge && catalogCanConfirmStaleItems() && (stale.length || changed)) saveCart(normalizedAvailable);
    return { items: normalizedAvailable, stale, storedItems };
}

function getAvailableCartItems(options) {
    return reconcileCart(options).items;
}

function notifyCart(message, icon = 'bag') {
    if (typeof showNotification === 'function') showNotification(message, icon);
    else if (typeof window.alert === 'function') window.alert(message);
}

function addToCart(productId, quantity = 1, options = {}) {
    const product = cartProduct(productId);
    if (!product) {
        notifyCart('This product is not available in the live catalog.', 'box');
        return false;
    }
    const stock = Number(product.stockQuantity);
    const stockLimit = Number.isInteger(stock) ? Math.max(0, Math.min(CART_MAX_QUANTITY, stock)) : CART_MAX_QUANTITY;
    if (product.inStock === false || stockLimit === 0) {
        notifyCart('This product is currently out of stock.', 'box');
        return false;
    }
    if (localStorage.getItem('luxe_logged_in') !== 'true') {
        notifyCart('Please sign in or create an account to add items to your cart.', 'lock');
        setTimeout(() => { window.location.href = 'login.html'; }, 1500);
        return false;
    }

    const requestedQuantity = Math.min(CART_MAX_QUANTITY, Math.max(1, Math.trunc(Number(quantity) || 1)));
    const selected = resolveCartOptions(product, options || {});
    if (!selected.valid) {
        const labels = selected.missing.join(' and ');
        notifyCart(`Choose a ${labels || 'valid option'} on the product page before adding this item.`, 'box');
        return false;
    }
    const incoming = normalizeCartItem({ id: Number(productId), quantity: requestedQuantity, ...selected });
    if (!incoming) return false;
    const cart = loadCart();
    const existing = cart.find((item) => item.key === incoming.key);
    const otherVariantQuantity = cart
        .filter((item) => item.id === incoming.id && item.key !== incoming.key)
        .reduce((sum, item) => sum + item.quantity, 0);
    const lineLimit = Math.max(0, stockLimit - otherVariantQuantity);
    if (lineLimit < 1) {
        notifyCart(`Only ${stockLimit} unit${stockLimit === 1 ? '' : 's'} of this product are available across all options.`, 'box');
        return false;
    }
    if (existing) {
        const nextQuantity = Math.min(CART_MAX_QUANTITY, lineLimit, existing.quantity + requestedQuantity);
        if (nextQuantity === existing.quantity) {
            notifyCart(`Only ${stockLimit} of this option can be added.`, 'box');
            return false;
        }
        existing.quantity = nextQuantity;
    } else {
        incoming.quantity = Math.min(incoming.quantity, lineLimit);
        cart.push(incoming);
    }
    saveCart(cart);
    notifyCart('Added to cart.', 'bag');
    return true;
}

function cartItemMatchesReference(item, reference) {
    if (typeof reference === 'string' && reference.includes('::')) return item.key === reference;
    return item.id === Number(reference);
}

function removeFromCart(reference) {
    saveCart(loadCart().filter((item) => !cartItemMatchesReference(item, reference)));
    if (document.getElementById('cartItems')) renderCartPage();
}

function updateCartQuantity(reference, delta) {
    const cart = loadCart();
    const item = cart.find((entry) => cartItemMatchesReference(entry, reference));
    if (!item) return;
    const product = cartProduct(item.id);
    const stock = Number(product?.stockQuantity);
    const stockLimit = Number.isInteger(stock) ? Math.max(0, Math.min(CART_MAX_QUANTITY, stock)) : CART_MAX_QUANTITY;
    if (!product || product.inStock === false || stockLimit < 1) {
        removeFromCart(item.key);
        notifyCart('This product is no longer available.', 'box');
        return;
    }
    const otherVariantQuantity = cart
        .filter((entry) => entry.id === item.id && entry.key !== item.key)
        .reduce((sum, entry) => sum + entry.quantity, 0);
    const lineLimit = Math.max(0, stockLimit - otherVariantQuantity);
    if (lineLimit < 1) {
        removeFromCart(item.key);
        notifyCart('Available stock is already allocated to another option in your cart.', 'box');
        return;
    }
    const next = item.quantity + Math.trunc(Number(delta) || 0);
    if (next <= 0) {
        removeFromCart(item.key);
        return;
    }
    item.quantity = Math.min(next, lineLimit, CART_MAX_QUANTITY);
    if (next > item.quantity) notifyCart(`Maximum quantity is ${item.quantity}.`, 'box');
    saveCart(cart);
    if (document.getElementById('cartItems')) renderCartPage();
}

function updateCartCount() {
    const count = loadCart().reduce((sum, item) => sum + item.quantity, 0);
    document.querySelectorAll('.cart-count').forEach((badge) => { badge.textContent = count; });
}

function escapeCartHtml(value) { return window.LuxeUtils.escapeHtml(value); }

function productMoney(product, oldPrice = false) {
    const fallbackValue = Number(oldPrice ? product?.oldPrice : product?.price || 0);
    const money = window.LuxeMoney?.forProduct(product, oldPrice) || {
        usd: `$${fallbackValue.toFixed(2)}`,
        ngn: '',
    };
    return { usd: escapeCartHtml(money.usd), ngn: escapeCartHtml(money.ngn) };
}

function renderEmptyCart(container, message = "Looks like you haven't added anything to your cart yet.") {
    cartQuoteGeneration += 1;
    container.innerHTML = `
        <div class="empty-cart">
            <i class="fas fa-shopping-bag"></i>
            <h3>Your cart is empty</h3>
            <p>${escapeCartHtml(message)}</p>
            <a href="shop.html" class="btn btn-primary" style="margin-top:15px;display:inline-block;">Start Shopping</a>
        </div>`;
    ['cartSubtotal', 'cartShipping', 'cartTax', 'cartTotal'].forEach((id) => {
        const element = document.getElementById(id);
        if (element) element.textContent = window.LuxeMoney?.formatUSD(0) || '$0.00';
    });
}

function renderCartPage() {
    const container = document.getElementById('cartItems');
    if (!container) return;
    const { items, stale, storedItems } = reconcileCart({ purge: true });
    if (!items.length) {
        const unavailable = storedItems.length && (stale.length || window.LuxeCatalogStatus?.state === 'unavailable');
        renderEmptyCart(container, unavailable
            ? 'Saved items are no longer available, or the live catalog could not be loaded.'
            : undefined);
        return;
    }

    let subtotal = 0;
    container.innerHTML = items.map((item) => {
        const product = cartProduct(item.id);
        if (!product) return '';
        const itemTotal = Number(product.price) * item.quantity;
        subtotal += itemTotal;
        const unitMoney = productMoney(product);
        const optionParts = [
            item.size ? `Size: ${escapeCartHtml(item.size)}` : '',
            item.color ? `Color: ${escapeCartHtml(item.color)}` : '',
        ].filter(Boolean);
        return `
            <div class="cart-item" data-id="${Number(product.id)}" data-cart-key="${escapeCartHtml(item.key)}">
                <img ${window.LuxeMedia.attributes(product.image, { preset: 'compact', alt: product.name })}>
                <div class="cart-item-info">
                    <h4>${escapeCartHtml(product.name)}</h4>
                    <p class="item-price">${unitMoney.ngn || unitMoney.usd}${unitMoney.ngn && unitMoney.usd ? ` <small>(${unitMoney.usd})</small>` : ''}</p>
                    ${optionParts.length ? `<p class="cart-item-options">${optionParts.join(' · ')}</p>` : ''}
                    <div class="quantity-controls">
                        <button class="qty-btn" type="button" data-cart-action="decrease" aria-label="Decrease ${escapeCartHtml(product.name)} quantity">−</button>
                        <span>${item.quantity}</span>
                        <button class="qty-btn" type="button" data-cart-action="increase" aria-label="Increase ${escapeCartHtml(product.name)} quantity">+</button>
                    </div>
                </div>
                <div class="item-total">${escapeCartHtml(window.LuxeMoney?.formatUSD(itemTotal) || `$${itemTotal.toFixed(2)}`)}</div>
                <div class="cart-item-actions" style="display:flex;align-items:center;gap:8px;">
                    <button class="remove-btn" type="button" data-cart-action="remove" title="Remove item" aria-label="Remove ${escapeCartHtml(product.name)}">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            </div>`;
    }).join('');
    window.LuxeMedia.hydrate(container);

    container.onclick = (event) => {
        const button = event.target.closest?.('[data-cart-action]');
        const row = button?.closest?.('[data-cart-key]');
        if (!button || !row) return;
        const key = row.dataset.cartKey;
        if (button.dataset.cartAction === 'decrease') updateCartQuantity(key, -1);
        if (button.dataset.cartAction === 'increase') updateCartQuantity(key, 1);
        if (button.dataset.cartAction === 'remove') removeFromCart(key);
    };

    const formatUSD = (amount) => window.LuxeMoney?.formatUSD(amount) || `$${amount.toFixed(2)}`;
    const subtotalElement = document.getElementById('cartSubtotal');
    const shippingElement = document.getElementById('cartShipping');
    const taxElement = document.getElementById('cartTax');
    const totalElement = document.getElementById('cartTotal');
    if (subtotalElement) subtotalElement.textContent = formatUSD(subtotal);
    if (shippingElement) shippingElement.textContent = 'At checkout';
    if (taxElement) taxElement.textContent = 'At checkout';
    if (totalElement) totalElement.textContent = 'At checkout';
    void refreshCartQuote(items);
}

async function refreshCartQuote(items) {
    const generation = ++cartQuoteGeneration;
    if (!items.length || !window.LuxeOrders?.quote || !window.LuxeAuth?.isReady?.()) return;

    const user = await window.LuxeAuth.getCurrentUser();
    if (generation !== cartQuoteGeneration || !user) return;

    const quoteItems = items.map((item) => ({
        id: item.id,
        quantity: item.quantity,
        size: item.size || null,
        color: item.color || null,
    }));
    const { data, error } = await window.LuxeOrders.quote(quoteItems);
    if (generation !== cartQuoteGeneration || error || !data) return;

    const totals = ['subtotal', 'shipping', 'tax', 'total'].reduce((result, key) => {
        const amount = Number(data[key]);
        result[key] = Number.isFinite(amount) && amount >= 0 ? amount : null;
        return result;
    }, {});
    if (Object.values(totals).some((amount) => amount === null)) return;

    const formatUSD = (amount) => window.LuxeMoney?.formatUSD(amount) || `$${amount.toFixed(2)}`;
    const subtotalElement = document.getElementById('cartSubtotal');
    const shippingElement = document.getElementById('cartShipping');
    const taxElement = document.getElementById('cartTax');
    const totalElement = document.getElementById('cartTotal');
    if (subtotalElement) subtotalElement.textContent = formatUSD(totals.subtotal);
    if (shippingElement) shippingElement.textContent = totals.shipping === 0 ? 'Free' : formatUSD(totals.shipping);
    if (taxElement) taxElement.textContent = formatUSD(totals.tax);
    if (totalElement) totalElement.textContent = formatUSD(totals.total);
}

document.addEventListener('DOMContentLoaded', async () => {
    updateCartCount();
    if (document.getElementById('cartItems')) {
        if (window.productsReady) await window.productsReady;
        renderCartPage();
    }
});

function sendProductToWhatsApp(productId, quantity = 1, options = {}) {
    if (addToCart(productId, quantity, options)) window.location.href = 'checkout.html';
}

window.CART_MAX_QUANTITY = CART_MAX_QUANTITY;
window.getCartStorageKey = getCartStorageKey;
window.getCartItemKey = getCartItemKey;
window.getAvailableCartItems = getAvailableCartItems;
window.loadCart = loadCart;
window.saveCart = saveCart;
window.addToCart = addToCart;
window.removeFromCart = removeFromCart;
window.updateCartQuantity = updateCartQuantity;
window.updateCartCount = updateCartCount;
window.renderCartPage = renderCartPage;
window.sendProductToWhatsApp = sendProductToWhatsApp;
