// js/checkout.js - Checkout Page Form Handling and Summary
//
// SECURITY:
// The browser displays an estimated total, but DOES NOT decide the
// persisted order price. createOrder_secure() in Postgres reloads each
// product's current price and calculates subtotal/shipping/tax/total.

document.addEventListener("DOMContentLoaded", async () => {
  if (window.productsReady) {
    await window.productsReady;
  }

  const loader = document.getElementById("loader");

  if (loader) {
    setTimeout(() => {
      loader.style.display = "none";
    }, 300);
  }

  loadCheckoutItems();
  updateOrderTotals();
  prefillSavedAddress();

  // ---------------------------------------------------------------
  // PAYMENT METHOD UI
  // ---------------------------------------------------------------

  document
    .querySelectorAll('input[name="payment"]')
    .forEach((radio) => {
      radio.addEventListener("change", (event) => {
        const creditCardFields =
          document.getElementById("creditCardFields");

        if (!creditCardFields) return;

        creditCardFields.style.display =
          event.target.value === "credit" ? "block" : "none";
      });
    });

  // ---------------------------------------------------------------
  // CHECKOUT
  // ---------------------------------------------------------------

  const checkoutForm = document.getElementById("checkoutForm");

  if (checkoutForm) {
    checkoutForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      if (!validateCheckoutForm()) return;

      const currentUser =
        window.LuxeAuth && window.LuxeAuth.isReady()
          ? await window.LuxeAuth.getCurrentUser()
          : null;

      if (!currentUser) {
        showCheckoutError("Please sign in before placing your order.");

        setTimeout(() => {
          window.location.href = "login.html";
        }, 1200);

        return;
      }

      const cartItems = getCheckoutCartItems();

      if (!cartItems.length) {
        showCheckoutError("Your cart is empty.");
        return;
      }

      // Only identifiers + quantities leave the browser.
      // Product names/prices/totals are ignored for order authority.
      const secureItems = cartItems.map((item) => ({
        product_id: Number(item.id),
        quantity: Number(item.quantity),
      }));

      const shippingAddress = {
        firstName: document.getElementById("firstName")?.value.trim() || "",
        lastName: document.getElementById("lastName")?.value.trim() || "",
        email: document.getElementById("email")?.value.trim() || "",
        phone: document.getElementById("phone")?.value.trim() || "",
        address: document.getElementById("address")?.value.trim() || "",
        city: document.getElementById("city")?.value.trim() || "",
        state: document.getElementById("state")?.value.trim() || "",
        zip: document.getElementById("zip")?.value.trim() || "",
      };

      const button = checkoutForm.querySelector(".checkout-btn");

      if (button) {
        button.innerHTML =
          '<i class="fas fa-spinner fa-spin"></i> Processing Order...';
        button.disabled = true;
      }

      const { data: order, error } =
        await window.LuxeOrders.createOrder(
          secureItems,
          shippingAddress,
        );

      if (error) {
        if (button) {
          button.innerHTML = "Place Order";
          button.disabled = false;
        }

        showCheckoutError(
          "Could not place order: " +
            (error.message || "Unknown checkout error"),
        );

        return;
      }

      localStorage.removeItem("luxe_cart");

      if (typeof updateCartCount === "function") {
        updateCartCount();
      }

      const orderSummary = document.querySelector(".checkout-grid");

      if (orderSummary) {
        orderSummary.innerHTML = `
          <div style="
            grid-column: 1 / -1;
            text-align: center;
            padding: 60px 20px;
            background: #ffffff;
            border-radius: 12px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.08);
          ">
            <i
              class="fas fa-check-circle"
              style="font-size:4.5rem;color:#27AE60;margin-bottom:20px;"
            ></i>

            <h2 style="
              font-family:'Playfair Display',serif;
              font-size:2.2rem;
              margin-bottom:15px;
            ">
              Order Placed Successfully!
            </h2>

            <p style="
              color:#777777;
              font-size:1.1rem;
              max-width:560px;
              margin:0 auto 10px;
            ">
              Thank you for your order
              (<strong>${escapeCheckoutHtml(order.order_number)}</strong>).
            </p>

            <p style="
              color:#777777;
              font-size:1rem;
              max-width:560px;
              margin:0 auto 20px;
            ">
              Final server-verified total:
              <strong>$${Number(order.total).toFixed(2)}</strong>
            </p>

            <div style="
              display:flex;
              gap:15px;
              justify-content:center;
              margin-top:25px;
              flex-wrap:wrap;
            ">
              <a
                href="dashboard.html"
                class="btn btn-primary"
                style="padding:14px 30px;border-radius:30px;text-decoration:none;"
              >
                <i class="fas fa-box"></i>
                Track Order in Dashboard
              </a>

              <a
                href="shop.html"
                class="btn btn-outline"
                style="padding:14px 30px;border-radius:30px;text-decoration:none;"
              >
                Continue Shopping
              </a>
            </div>
          </div>
        `;
      }
    });
  }

  // ---------------------------------------------------------------
  // CARD FIELD FORMATTING
  //
  // These fields are UI-only in the current project. This file never
  // sends card number, expiry or CVV to Supabase.
  // ---------------------------------------------------------------

  const cardNumber = document.getElementById("cardNumber");

  cardNumber?.addEventListener("input", (event) => {
    let value = event.target.value.replace(/\D/g, "");
    value = value.replace(/(.{4})/g, "$1 ").trim();
    event.target.value = value.substring(0, 19);
  });

  const expiryDate = document.getElementById("expiryDate");

  expiryDate?.addEventListener("input", (event) => {
    let value = event.target.value.replace(/\D/g, "");

    if (value.length >= 2) {
      value =
        value.substring(0, 2) +
        "/" +
        value.substring(2, 4);
    }

    event.target.value = value.substring(0, 5);
  });

  const cvv = document.getElementById("cvv");

  cvv?.addEventListener("input", (event) => {
    event.target.value = event.target.value
      .replace(/\D/g, "")
      .substring(0, 4);
  });
});

// ---------------------------------------------------------------------
// CART / PRODUCT HELPERS
// ---------------------------------------------------------------------

function getCheckoutCartItems() {
  if (typeof loadCart === "function") {
    return loadCart();
  }

  try {
    const stored = localStorage.getItem("luxe_cart");
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function getProduct(id) {
  if (typeof getProductById === "function") {
    return getProductById(id);
  }

  const all = window.products || [];
  const numericId = Number(id);

  return all.find((product) => Number(product.id) === numericId);
}

function loadCheckoutItems() {
  const container = document.getElementById("orderItems");
  if (!container) return;

  const cartItems = getCheckoutCartItems();

  if (!cartItems.length) {
    container.innerHTML = `
      <div style="text-align:center;padding:20px 0;">
        <p style="color:#777777;">Your cart is empty</p>
        <a
          href="shop.html"
          class="btn btn-primary"
          style="
            margin-top:10px;
            display:inline-block;
            padding:8px 16px;
            font-size:0.85rem;
          "
        >
          Shop Now
        </a>
      </div>
    `;
    return;
  }

  container.innerHTML = cartItems
    .map((item) => {
      const product = getProduct(item.id);
      if (!product) return "";

      const quantity = Math.max(1, Number(item.quantity) || 1);
      const price = Number(product.price) || 0;

      return `
        <div style="
          display:flex;
          align-items:center;
          gap:15px;
          margin-bottom:15px;
          padding-bottom:15px;
          border-bottom:1px solid #eee;
        ">
          <img
            src="${escapeCheckoutAttr(product.image)}"
            alt="${escapeCheckoutAttr(product.name)}"
            style="
              width:60px;
              height:60px;
              object-fit:cover;
              border-radius:6px;
            "
          >

          <div style="flex:1;">
            <h4 style="
              font-size:0.95rem;
              font-weight:500;
              margin-bottom:4px;
            ">
              ${escapeCheckoutHtml(product.name)}
            </h4>

            <p style="font-size:0.85rem;color:#777777;">
              Qty: ${quantity} × $${price.toFixed(2)}
            </p>
          </div>

          <div style="font-weight:600;font-size:0.95rem;">
            $${(price * quantity).toFixed(2)}
          </div>
        </div>
      `;
    })
    .join("");
}

// Display-only estimate.
// Postgres recalculates the authoritative amount during checkout.
function updateOrderTotals() {
  const cartItems = getCheckoutCartItems();

  let subtotal = 0;

  cartItems.forEach((item) => {
    const product = getProduct(item.id);

    if (product) {
      subtotal +=
        (Number(product.price) || 0) *
        Math.max(1, Number(item.quantity) || 1);
    }
  });

  const shipping =
    cartItems.length > 0 ? (subtotal > 200 ? 0 : 15) : 0;
  const tax = subtotal * 0.08;
  const total = subtotal + shipping + tax;

  setText("checkoutSubtotal", `$${subtotal.toFixed(2)}`);
  setText(
    "checkoutShipping",
    shipping === 0 ? "Free" : `$${shipping.toFixed(2)}`,
  );
  setText("checkoutTax", `$${tax.toFixed(2)}`);
  setText("checkoutTotal", `$${total.toFixed(2)}`);
}

// ---------------------------------------------------------------------
// VALIDATION
// ---------------------------------------------------------------------

function validateCheckoutForm() {
  const requiredFields =
    document.querySelectorAll("#checkoutForm [required]");

  let valid = true;

  requiredFields.forEach((field) => {
    if (!field.value.trim()) {
      field.style.borderColor = "#E74C3C";
      valid = false;
    } else {
      field.style.borderColor = "";
    }
  });

  const email = document.getElementById("email");

  if (email?.value) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email.value)) {
      email.style.borderColor = "#E74C3C";
      valid = false;
    }
  }

  const creditCardRadio =
    document.getElementById("creditCard");

  if (creditCardRadio?.checked) {
    const cardNumber =
      document.getElementById("cardNumber");
    const expiry =
      document.getElementById("expiryDate");
    const cvv =
      document.getElementById("cvv");
    const cardName =
      document.getElementById("cardName");

    if (
      cardNumber &&
      cardNumber.value.replace(/\s/g, "").length < 16
    ) {
      cardNumber.style.borderColor = "#E74C3C";
      valid = false;
    }

    if (expiry && expiry.value.length < 5) {
      expiry.style.borderColor = "#E74C3C";
      valid = false;
    }

    if (cvv && cvv.value.length < 3) {
      cvv.style.borderColor = "#E74C3C";
      valid = false;
    }

    if (cardName && !cardName.value.trim()) {
      cardName.style.borderColor = "#E74C3C";
      valid = false;
    }
  }

  if (!valid) {
    showCheckoutError(
      "Please fill in all required fields correctly.",
    );
  }

  return valid;
}

// ---------------------------------------------------------------------
// ADDRESS PREFILL
// ---------------------------------------------------------------------

function prefillSavedAddress() {
  const isLoggedIn =
    localStorage.getItem("luxe_logged_in") === "true";
  const storedUser =
    localStorage.getItem("luxe_user");

  if (!isLoggedIn || !storedUser) return;

  try {
    const user = JSON.parse(storedUser);
    const storageKey = `luxe_addresses_${user.email}`;

    const addresses = JSON.parse(
      localStorage.getItem(storageKey) || "[]",
    );

    const defaultAddress =
      addresses.find((address) => address.isDefault) ||
      addresses[0];

    if (!defaultAddress) {
      setInputValue("email", user.email || "");
      return;
    }

    const fullName =
      defaultAddress.fullName ||
      user.fullName ||
      "";

    const nameParts = fullName.trim().split(/\s+/);

    setInputValue("firstName", nameParts[0] || "");
    setInputValue(
      "lastName",
      nameParts.slice(1).join(" "),
    );
    setInputValue("email", user.email || "");
    setInputValue(
      "phone",
      defaultAddress.phone || user.phone || "",
    );
    setInputValue(
      "address",
      defaultAddress.street || "",
    );
    setInputValue("city", defaultAddress.city || "");
    setInputValue("state", defaultAddress.state || "");
    setInputValue("zip", defaultAddress.zip || "");
  } catch (error) {
    console.warn("[LUXE] Saved address could not be loaded:", error);
  }
}

// ---------------------------------------------------------------------
// UI HELPERS
// ---------------------------------------------------------------------

function showCheckoutError(message) {
  const existing =
    document.querySelector(".checkout-error");

  if (existing) existing.remove();

  const element = document.createElement("div");

  element.className = "checkout-error";
  element.style.cssText = `
    background:#E74C3C;
    color:white;
    padding:12px 16px;
    border-radius:8px;
    margin-bottom:20px;
    font-weight:500;
  `;
  element.textContent = message;

  const form =
    document.querySelector(".checkout-form-wrapper");

  if (form) {
    form.insertBefore(element, form.firstChild);
  }

  setTimeout(() => element.remove(), 5000);
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function setInputValue(id, value) {
  const element = document.getElementById(id);
  if (element) element.value = value;
}

function escapeCheckoutHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function escapeCheckoutAttr(value) {
  return escapeCheckoutHtml(value);
}

window.prefillSavedAddress = prefillSavedAddress;
