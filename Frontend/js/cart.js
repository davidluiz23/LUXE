// js/cart.js - Comprehensive Cart Management

function getCartStorageKey() {
    const isLoggedIn = localStorage.getItem('luxe_logged_in') === 'true';
    const storedUser = localStorage.getItem('luxe_user');
    if (isLoggedIn && storedUser) {
        try {
            const user = JSON.parse(storedUser);
            if (user && user.email) {
                return `luxe_cart_${user.email}`;
            }
        } catch (e) {}
    }
    return 'luxe_cart';
}

function loadCart() {
    try {
        const isLoggedIn = localStorage.getItem('luxe_logged_in') === 'true';
        if (!isLoggedIn) return []; // Return empty cart if not logged in

        const key = getCartStorageKey();
        const stored = localStorage.getItem(key);
        return stored ? JSON.parse(stored) : [];
    } catch (e) {
        console.error('Error loading cart:', e);
        return [];
    }
}

function saveCart(cart) {
    try {
        const key = getCartStorageKey();
        localStorage.setItem(key, JSON.stringify(cart));
        updateCartCount();
    } catch (e) {
        console.error('Error saving cart:', e);
    }
}

function addToCart(productId, quantity = 1) {
    const isLoggedIn = localStorage.getItem('luxe_logged_in') === 'true';
    if (!isLoggedIn) {
        if (typeof showNotification === 'function') {
            showNotification('Please log in or create an account to add items to cart! 🔒');
        } else {
            alert('Please log in or create an account to add items to cart!');
        }
        setTimeout(() => {
            window.location.href = 'login.html';
        }, 1500);
        return false;
    }

    const cart = loadCart();
    const existing = cart.find(item => item.id === productId);
    if (existing) {
        existing.quantity += quantity;
    } else {
        cart.push({ id: productId, quantity: quantity });
    }
    saveCart(cart);
    if (typeof showNotification === 'function') {
        showNotification('Added to cart! 🛒');
    }
    return true;
}

function removeFromCart(productId) {
    let cart = loadCart();
    cart = cart.filter(item => item.id !== productId);
    saveCart(cart);
    if (document.getElementById('cartItems')) {
        renderCartPage();
    }
}

function updateCartQuantity(productId, delta) {
    const cart = loadCart();
    const item = cart.find(i => i.id === productId);
    if (item) {
        item.quantity += delta;
        if (item.quantity <= 0) {
            removeFromCart(productId);
            return;
        }
        saveCart(cart);
        if (document.getElementById('cartItems')) {
            renderCartPage();
        }
    }
}

function updateCartCount() {
    const cart = loadCart();
    const count = cart.reduce((sum, item) => sum + (item.quantity || 1), 0);
    document.querySelectorAll('.cart-count').forEach(badge => {
        if (badge) badge.textContent = count;
    });
}

function renderCartPage() {
    const container = document.getElementById('cartItems');
    if (!container) return;

    const cart = loadCart();
    if (cart.length === 0) {
        container.innerHTML = `
            <div class="empty-cart">
                <i class="fas fa-shopping-bag"></i>
                <h3>Your cart is empty</h3>
                <p>Looks like you haven't added anything to your cart yet.</p>
                <a href="shop.html" class="btn btn-primary" style="margin-top: 15px; display: inline-block;">Start Shopping</a>
            </div>
        `;
        if (document.getElementById('cartSubtotal')) document.getElementById('cartSubtotal').textContent = '$0.00';
        if (document.getElementById('cartShipping')) document.getElementById('cartShipping').textContent = '$0.00';
        if (document.getElementById('cartTax')) document.getElementById('cartTax').textContent = '$0.00';
        if (document.getElementById('cartTotal')) document.getElementById('cartTotal').textContent = '$0.00';
        return;
    }

    let html = '';
    let subtotal = 0;

    cart.forEach(item => {
        const product = (typeof getProductById === 'function') ? getProductById(item.id) : ((window.products || []).find(p => p.id === item.id));
        if (!product) return;

        const itemTotal = product.price * item.quantity;
        subtotal += itemTotal;

        html += `
            <div class="cart-item" data-id="${product.id}">
                <img src="${product.image}" alt="${product.name}">
                <div class="cart-item-info">
                    <h4>${product.name}</h4>
                    <p class="item-price">$${product.price.toFixed(2)}</p>
                    <div class="quantity-controls">
                        <button class="qty-btn" onclick="window.updateCartQuantity(${product.id}, -1)">−</button>
                        <span>${item.quantity}</span>
                        <button class="qty-btn" onclick="window.updateCartQuantity(${product.id}, 1)">+</button>
                    </div>
                </div>
                <div class="item-total">$${itemTotal.toFixed(2)}</div>
                <div class="cart-item-actions" style="display: flex; align-items: center; gap: 8px;">
                    <button class="whatsapp-item-btn" onclick="window.sendProductToWhatsApp(${product.id}, ${item.quantity})" title="Send item to WhatsApp" style="background: #25D366; color: white; border: none; border-radius: 50%; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: transform 0.2s ease;">
                        <i class="fab fa-whatsapp" style="font-size: 1.1rem;"></i>
                    </button>
                    <button class="remove-btn" onclick="window.removeFromCart(${product.id})" title="Remove item">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;

    const shipping = subtotal > 200 ? 0 : 15;
    const tax = subtotal * 0.08;
    const total = subtotal + shipping + tax;

    if (document.getElementById('cartSubtotal')) document.getElementById('cartSubtotal').textContent = `$${subtotal.toFixed(2)}`;
    if (document.getElementById('cartShipping')) document.getElementById('cartShipping').textContent = shipping === 0 ? 'Free' : `$${shipping.toFixed(2)}`;
    if (document.getElementById('cartTax')) document.getElementById('cartTax').textContent = `$${tax.toFixed(2)}`;
    if (document.getElementById('cartTotal')) document.getElementById('cartTotal').textContent = `$${total.toFixed(2)}`;
}

document.addEventListener('DOMContentLoaded', async () => {
    updateCartCount();
    if (document.getElementById('cartItems')) {
        // Only the cart page itself needs product details, so only it
        // waits on the live catalog — the cart-count badge on every
        // other page renders instantly above.
        if (window.productsReady) await window.productsReady;
        renderCartPage();
    }
});

const WHATSAPP_NUMBER = '2348103463852';

function formatCurrency(amount) {
    return '$' + amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function sendCartToWhatsApp() {
    const cart = loadCart();
    if (!cart || cart.length === 0) {
        alert('Your cart is empty! Add products before sending to WhatsApp.');
        return;
    }

    let itemsText = '';
    let subtotal = 0;

    cart.forEach((item, index) => {
        const product = (typeof getProductById === 'function') ? getProductById(item.id) : ((window.products || []).find(p => p.id === item.id));
        if (!product) return;

        const itemTotal = product.price * item.quantity;
        subtotal += itemTotal;

        const fullImageUrl = product.image.startsWith('http') ? product.image : (window.location.origin + '/' + product.image);

        itemsText += `🖼️ *Image:* ${fullImageUrl}\n` +
                     `📦 *Product:* ${product.name}\n` +
                     `💰 *Price:* ${formatCurrency(product.price)} | *Qty:* ${item.quantity} | *Subtotal:* ${formatCurrency(itemTotal)}\n\n`;
    });

    const shipping = subtotal > 200 ? 0 : 15;
    const tax = subtotal * 0.08;
    const total = subtotal + shipping + tax;

    const message = `🛍️ *NEW ORDER - LUXE STORE*\n` +
                    `=================================\n\n` +
                    `${itemsText}` +
                    `=================================\n` +
                    `💵 *Cart Subtotal:* ${formatCurrency(subtotal)}\n` +
                    `🚚 *Shipping:* ${shipping === 0 ? 'Free' : formatCurrency(shipping)}\n` +
                    `🏛️ *Tax (8%):* ${formatCurrency(tax)}\n` +
                    `💳 *Grand Total:* ${formatCurrency(total)}\n` +
                    `=================================\n` +
                    `Please process my order. Thank you!`;

    const whatsappUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
}

function sendProductToWhatsApp(productId, quantity = 1) {
    const product = (typeof getProductById === 'function') ? getProductById(productId) : ((window.products || []).find(p => p.id === productId));
    if (!product) {
        alert('Product not found!');
        return;
    }

    const total = product.price * quantity;
    const fullImageUrl = product.image.startsWith('http') ? product.image : (window.location.origin + '/' + product.image);

    const message = `🛍️ *PRODUCT ORDER - LUXE STORE*\n` +
                    `=================================\n` +
                    `🖼️ *Image:* ${fullImageUrl}\n` +
                    `📦 *Product:* ${product.name}\n` +
                    `💰 *Price:* ${formatCurrency(product.price)}\n` +
                    `🔢 *Quantity:* ${quantity}\n` +
                    `💳 *Total Amount:* ${formatCurrency(total)}\n` +
                    `=================================\n` +
                    `Hi, I would like to order this item directly. Please confirm availability!`;

    const whatsappUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
}

// Expose functions globally
window.loadCart = loadCart;
window.saveCart = saveCart;
window.addToCart = addToCart;
window.removeFromCart = removeFromCart;
window.updateCartQuantity = updateCartQuantity;
window.updateCartCount = updateCartCount;
window.renderCartPage = renderCartPage;
window.sendCartToWhatsApp = sendCartToWhatsApp;
window.sendProductToWhatsApp = sendProductToWhatsApp;