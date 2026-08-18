// js/checkout.js - Checkout Page Form Handling and Summary

document.addEventListener('DOMContentLoaded', async () => {
    // Wait for the live product catalog (Supabase) to finish loading.
    if (window.productsReady) await window.productsReady;
    // Hide loader
    const loader = document.getElementById('loader');
    if (loader) {
        setTimeout(() => {
            loader.style.display = 'none';
        }, 300);
    }

    // Load cart items & order totals
    loadCheckoutItems();
    updateOrderTotals();
    prefillSavedAddress();

    // Payment method toggle
    document.querySelectorAll('input[name="payment"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            const creditCardFields = document.getElementById('creditCardFields');
            if (creditCardFields) {
                if (e.target.value === 'credit') {
                    creditCardFields.style.display = 'block';
                } else {
                    creditCardFields.style.display = 'none';
                }
            }
        });
    });

    // Checkout form submission
    const checkoutForm = document.getElementById('checkoutForm');
    if (checkoutForm) {
        checkoutForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            // Validate form
            if (!validateCheckoutForm()) return;

            // Orders are tied to a real account so Row Level Security
            // can guarantee only this user can ever read them back.
            const currentUser = (window.LuxeAuth && window.LuxeAuth.isReady())
                ? await window.LuxeAuth.getCurrentUser()
                : null;

            if (!currentUser) {
                showCheckoutError('Please sign in before placing your order.');
                setTimeout(() => { window.location.href = 'login.html'; }, 1500);
                return;
            }

            // Show loading state
            const btn = checkoutForm.querySelector('.checkout-btn');
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing Order...';
            btn.disabled = true;

            const cartItems = getCheckoutCartItems();

            let orderTotal = 0;
            const itemsList = cartItems.map(item => {
                const prod = getProduct(item.id);
                if (prod) orderTotal += prod.price * item.quantity;
                return {
                    id: item.id,
                    name: prod ? prod.name : 'Product',
                    price: prod ? prod.price : 0,
                    quantity: item.quantity,
                    image: prod ? prod.image : ''
                };
            });

            const shippingCost = orderTotal > 200 ? 0 : 15;
            const taxCost = orderTotal * 0.08;
            const finalTotal = orderTotal + shippingCost + taxCost;

            const shippingAddress = {
                firstName: document.getElementById('firstName')?.value || '',
                lastName: document.getElementById('lastName')?.value || '',
                address: document.getElementById('address')?.value || '',
                city: document.getElementById('city')?.value || '',
                state: document.getElementById('state')?.value || '',
                zip: document.getElementById('zip')?.value || ''
            };

            const { data: order, error } = await window.LuxeOrders.createOrder(
                currentUser.id,
                itemsList,
                { subtotal: orderTotal, shipping: shippingCost, tax: taxCost, total: finalTotal },
                shippingAddress
            );

            if (error) {
                btn.innerHTML = 'Place Order';
                btn.disabled = false;
                showCheckoutError('Could not place order: ' + error.message);
                return;
            }

            // Clear cart
            localStorage.removeItem('luxe_cart');
            if (typeof updateCartCount === 'function') updateCartCount();

            // Show success message
            const orderSummary = document.querySelector('.checkout-grid');
            if (orderSummary) {
                orderSummary.innerHTML = `
                    <div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px; background: #ffffff; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.08);">
                        <i class="fas fa-check-circle" style="font-size: 4.5rem; color: #27AE60; margin-bottom: 20px;"></i>
                        <h2 style="font-family: 'Playfair Display', serif; font-size: 2.2rem; margin-bottom: 15px;">Order Placed Successfully!</h2>
                        <p style="color: #777777; font-size: 1.1rem; max-width: 500px; margin: 0 auto 20px;">Thank you for your order (<strong>${order.order_number}</strong>). A confirmation has been saved to your account.</p>
                        <div style="display: flex; gap: 15px; justify-content: center; margin-top: 25px;">
                            <a href="dashboard.html" class="btn btn-primary" style="padding: 14px 30px; border-radius: 30px; text-decoration: none;"><i class="fas fa-box"></i> Track Order in Dashboard</a>
                            <a href="shop.html" class="btn btn-outline" style="padding: 14px 30px; border-radius: 30px; text-decoration: none;">Continue Shopping</a>
                        </div>
                    </div>
                `;
            }
        });
    }

    // Format card input
    const cardNumber = document.getElementById('cardNumber');
    if (cardNumber) {
        cardNumber.addEventListener('input', (e) => {
            let value = e.target.value.replace(/\D/g, '');
            value = value.replace(/(.{4})/g, '$1 ').trim();
            e.target.value = value.substring(0, 19);
        });
    }

    const expiryDate = document.getElementById('expiryDate');
    if (expiryDate) {
        expiryDate.addEventListener('input', (e) => {
            let value = e.target.value.replace(/\D/g, '');
            if (value.length >= 2) {
                value = value.substring(0, 2) + '/' + value.substring(2, 4);
            }
            e.target.value = value.substring(0, 5);
        });
    }

    const cvv = document.getElementById('cvv');
    if (cvv) {
        cvv.addEventListener('input', (e) => {
            e.target.value = e.target.value.replace(/\D/g, '').substring(0, 4);
        });
    }
});

function getCheckoutCartItems() {
    if (typeof loadCart === 'function') {
        return loadCart();
    }
    try {
        const stored = localStorage.getItem('luxe_cart');
        return stored ? JSON.parse(stored) : [];
    } catch (e) {
        return [];
    }
}

function getProduct(id) {
    if (typeof getProductById === 'function') {
        return getProductById(id);
    }
    const all = window.products || [];
    return all.find(p => p.id === id);
}

function loadCheckoutItems() {
    const container = document.getElementById('orderItems');
    if (!container) return;

    const cartItems = getCheckoutCartItems();

    if (cartItems.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 20px 0;">
                <p style="color: #777777;">Your cart is empty</p>
                <a href="shop.html" class="btn btn-primary" style="margin-top: 10px; display: inline-block; padding: 8px 16px; font-size: 0.85rem;">Shop Now</a>
            </div>
        `;
        return;
    }

    let html = '';
    cartItems.forEach(item => {
        const product = getProduct(item.id);
        if (!product) return;

        html += `
            <div class="order-item" style="display: flex; align-items: center; gap: 15px; margin-bottom: 15px; padding-bottom: 15px; border-bottom: 1px solid #eee;">
                <img src="${product.image}" alt="${product.name}" style="width: 60px; height: 60px; object-fit: cover; border-radius: 6px;">
                <div class="order-item-details" style="flex: 1;">
                    <h4 style="font-size: 0.95rem; font-weight: 500; margin-bottom: 4px;">${product.name}</h4>
                    <p style="font-size: 0.85rem; color: #777777;">Qty: ${item.quantity} × $${product.price.toFixed(2)}</p>
                </div>
                <div style="font-weight: 600; font-size: 0.95rem;">$${(product.price * item.quantity).toFixed(2)}</div>
            </div>
        `;
    });

    container.innerHTML = html;
}

function updateOrderTotals() {
    const cartItems = getCheckoutCartItems();

    let subtotal = 0;
    cartItems.forEach(item => {
        const product = getProduct(item.id);
        if (product) {
            subtotal += product.price * item.quantity;
        }
    });

    const shipping = cartItems.length > 0 ? (subtotal > 200 ? 0 : 15) : 0;
    const tax = subtotal * 0.08;
    const total = subtotal + shipping + tax;

    if (document.getElementById('checkoutSubtotal')) document.getElementById('checkoutSubtotal').textContent = `$${subtotal.toFixed(2)}`;
    if (document.getElementById('checkoutShipping')) document.getElementById('checkoutShipping').textContent = shipping === 0 ? 'Free' : `$${shipping.toFixed(2)}`;
    if (document.getElementById('checkoutTax')) document.getElementById('checkoutTax').textContent = `$${tax.toFixed(2)}`;
    if (document.getElementById('checkoutTotal')) document.getElementById('checkoutTotal').textContent = `$${total.toFixed(2)}`;
}

function validateCheckoutForm() {
    const requiredFields = document.querySelectorAll('#checkoutForm [required]');
    let isValid = true;

    requiredFields.forEach(field => {
        if (!field.value.trim()) {
            field.style.borderColor = '#E74C3C';
            isValid = false;
        } else {
            field.style.borderColor = '';
        }
    });

    // Validate email
    const email = document.getElementById('email');
    if (email && email.value) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email.value)) {
            email.style.borderColor = '#E74C3C';
            isValid = false;
            showCheckoutError('Please enter a valid email address');
        }
    }

    // Validate card fields if credit card is selected
    const creditCardRadio = document.getElementById('creditCard');
    if (creditCardRadio && creditCardRadio.checked) {
        const cardNumber = document.getElementById('cardNumber');
        const expiry = document.getElementById('expiryDate');
        const cvv = document.getElementById('cvv');
        const cardName = document.getElementById('cardName');

        if (cardNumber && cardNumber.value.replace(/\s/g, '').length < 16) {
            cardNumber.style.borderColor = '#E74C3C';
            isValid = false;
            showCheckoutError('Please enter a valid 16-digit card number');
        }

        if (expiry && expiry.value.length < 5) {
            expiry.style.borderColor = '#E74C3C';
            isValid = false;
            showCheckoutError('Please enter a valid expiry date (MM/YY)');
        }

        if (cvv && cvv.value.length < 3) {
            cvv.style.borderColor = '#E74C3C';
            isValid = false;
            showCheckoutError('Please enter a valid CVV');
        }

        if (cardName && !cardName.value.trim()) {
            cardName.style.borderColor = '#E74C3C';
            isValid = false;
            showCheckoutError('Please enter the name on card');
        }
    }

    if (!isValid) {
        showCheckoutError('Please fill in all required fields correctly');
    }

    return isValid;
}

function showCheckoutError(message) {
    const existing = document.querySelector('.checkout-error');
    if (existing) existing.remove();

    const errorDiv = document.createElement('div');
    errorDiv.className = 'checkout-error';
    errorDiv.style.cssText = `
        background: #E74C3C;
        color: white;
        padding: 12px 16px;
        border-radius: 8px;
        margin-bottom: 20px;
        font-weight: 500;
    `;
    errorDiv.textContent = message;

    const form = document.querySelector('.checkout-form-wrapper');
    if (form) {
        form.insertBefore(errorDiv, form.firstChild);
    }

    setTimeout(() => errorDiv.remove(), 4000);
}

function prefillSavedAddress() {
    const isLoggedIn = localStorage.getItem('luxe_logged_in') === 'true';
    const storedUser = localStorage.getItem('luxe_user');
    if (!isLoggedIn || !storedUser) return;

    const user = JSON.parse(storedUser);
    const userId = user.email;
    const addresses = JSON.parse(localStorage.getItem(`luxe_addresses_${userId}`) || '[]');
    const defaultAddr = addresses.find(a => a.isDefault) || addresses[0];

    if (defaultAddr) {
        const firstName = document.getElementById('firstName');
        const lastName = document.getElementById('lastName');
        const email = document.getElementById('email');
        const phone = document.getElementById('phone');
        const address = document.getElementById('address');
        const city = document.getElementById('city');
        const state = document.getElementById('state');
        const zip = document.getElementById('zip');

        if (firstName) firstName.value = defaultAddr.fullName.split(' ')[0] || user.fullName.split(' ')[0] || '';
        if (lastName) lastName.value = defaultAddr.fullName.split(' ').slice(1).join(' ') || '';
        if (email) email.value = user.email || '';
        if (phone) phone.value = defaultAddr.phone || user.phone || '';
        if (address) address.value = defaultAddr.street || '';
        if (city) city.value = defaultAddr.city || '';
        if (state) state.value = defaultAddr.state || '';
        if (zip) zip.value = defaultAddr.zip || '';
    }
}

window.prefillSavedAddress = prefillSavedAddress;