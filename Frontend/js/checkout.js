// Secure WhatsApp-first checkout. Prices are recalculated by PostgreSQL.
let checkoutAttemptMemory = null;
let appliedPromoCode = null;
let checkoutIdentity = {
  user: null,
  required: false,
  defaultCountryCode: "234",
  verifiedPhone: null,
};
let checkoutIdentityReady = Promise.resolve(checkoutIdentity);
const checkoutBrandName = () => window.LuxeBrand?.name || "ALKEBULAN";

document.addEventListener("DOMContentLoaded", async () => {
  if (window.productsReady) await window.productsReady;
  if (window.syncStorefrontNavigation) await window.syncStorefrontNavigation();
  const loader = document.getElementById("loader");
  if (loader) setTimeout(() => { loader.style.display = "none"; }, 250);

  configurePaymentOptions();
  prefillSavedAddress();
  checkoutIdentityReady = loadCheckoutIdentity();
  await checkoutIdentityReady;
  loadCheckoutItems();
  updateOrderTotals();

  document.getElementById("applyPromoBtn")?.addEventListener("click", applyPromoCode);
  document.getElementById("promoCode")?.addEventListener("input", () => {
    if (!appliedPromoCode) return;
    appliedPromoCode = null;
    setPromoStatus("Code changed. Apply it again to update the total.");
    updateOrderTotals();
  });

  const form = document.getElementById("checkoutForm");
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!validateCheckoutForm()) return;

    const cartItems = getCheckoutCartItems();
    if (!cartItems.length) return showCheckoutError("Your cart is empty.");

    const identity = await checkoutIdentityReady;
    const user = identity.user || (window.LuxeAuth?.isReady() ? await window.LuxeAuth.getCurrentUser() : null);
    if (!user) {
      showCheckoutError("Please sign in before placing your order.");
      setTimeout(() => { window.location.href = "login.html?returnTo=checkout.html"; }, 1200);
      return;
    }

    if (value("promoCode") && !appliedPromoCode) {
      showCheckoutError("Apply the promo code before placing your order.");
      return;
    }

    if (identity.required) {
      const orderPhone = window.LuxeWhatsApp?.normalizePhone(
        value("phone"),
        identity.defaultCountryCode,
      );
      if (!identity.verifiedPhone || orderPhone !== identity.verifiedPhone) {
        showCheckoutError("Verify this WhatsApp number in My Account before placing your order.");
        return;
      }
    }

    const provider = document.querySelector('input[name="payment"]:checked')?.value || "whatsapp";
    const providerConfig = window.LuxePaymentConfig?.providers?.[provider];
    if (!providerConfig?.enabled) return showCheckoutError("That payment option is not available yet.");

    const whatsappWindow = provider === "whatsapp" ? window.open("about:blank", "_blank") : null;
    const button = form.querySelector(".checkout-btn");
    setButtonState(button, true, "Saving secure order…");

    const normalizedPhone = window.LuxeWhatsApp?.normalizePhone(
      value("phone"),
      identity.defaultCountryCode,
    ) || value("phone");
    const contact = {
      name: `${value("firstName")} ${value("lastName")}`.trim(),
      email: value("email"),
      phone: normalizedPhone,
      whatsappOptIn: !!document.getElementById("whatsappConsent")?.checked,
    };
    const shippingAddress = {
      address: value("address"), city: value("city"), state: value("state"), zip: value("zip"),
    };
    const items = cartItems.map((item) => ({ id: item.id, quantity: item.quantity }));
    const idempotencyKey = getCheckoutIdempotencyKey({ items, shippingAddress, contact, provider, promoCode: appliedPromoCode });
    const { data: order, error } = await window.LuxeOrders.createOrder(
      items, shippingAddress, contact, provider, idempotencyKey, appliedPromoCode,
    );

    if (error || !order) {
      whatsappWindow?.close();
      setButtonState(button, false, "Place Order");
      showCheckoutError(`Could not place order: ${error?.message || "Please try again."}`);
      return;
    }

    const chatUrl = buildAdminWhatsAppUrl(order, cartItems, contact, shippingAddress);
    if (provider === "whatsapp" && whatsappWindow) whatsappWindow.location.href = chatUrl;

    const notificationPromise = window.LuxeOrders
      .sendWhatsAppNotifications("order_created", order.id)
      .catch((notifyError) => {
        console.warn("[ALKEBULAN] Order notifications were not sent:", notifyError);
        return { data: null, error: notifyError };
      });

    if (provider !== "whatsapp") {
      // Do not navigate away until the server has accepted the admin/customer
      // notification job; otherwise the browser can abort it mid-request.
      const [payment] = await Promise.all([
        window.LuxePaymentProviders.begin(provider, order),
        notificationPromise,
      ]);
      if (!payment.ok) {
        setButtonState(button, false, "Try Payment Again");
        return showCheckoutError(payment.error);
      }
      clearCheckoutAttempt();
      window.location.assign(payment.authorizationUrl);
      return;
    }

    await notificationPromise;
    clearCheckoutAttempt();
    window.saveCart?.([]);
    localStorage.removeItem("luxe_cart");
    window.updateCartCount?.();
    renderOrderSuccess(order, chatUrl, !!whatsappWindow);
  });
});

async function loadCheckoutIdentity() {
  const notice = document.getElementById("whatsappIdentityNotice");
  if (!window.LuxeAuth?.isReady()) return checkoutIdentity;
  const user = await window.LuxeAuth.getCurrentUser();
  if (!user) return checkoutIdentity;

  const [settings, profile] = await Promise.all([
    window.LuxeCommerce?.getSettings() || Promise.resolve({}),
    window.LuxeProfile?.get(user.id) || Promise.resolve(null),
  ]);
  checkoutIdentity = {
    user,
    required: !!settings.whatsappVerificationRequired,
    defaultCountryCode: settings.whatsappDefaultCountryCode || "234",
    verifiedPhone: profile?.whatsapp_verified_at ? profile.whatsapp_phone : null,
  };

  const phoneInput = document.getElementById("phone");
  if (checkoutIdentity.verifiedPhone && phoneInput) phoneInput.value = checkoutIdentity.verifiedPhone;
  if (!checkoutIdentity.required || !notice) return checkoutIdentity;

  notice.hidden = false;
  if (checkoutIdentity.verifiedPhone) {
    notice.className = "checkout-identity-note is-verified";
    notice.textContent = `Verified WhatsApp number: ${checkoutIdentity.verifiedPhone}`;
    if (phoneInput) phoneInput.readOnly = true;
  } else {
    notice.className = "checkout-identity-note is-error";
    notice.replaceChildren(
      document.createTextNode("Verify your WhatsApp number in "),
      Object.assign(document.createElement("a"), { href: "dashboard.html", textContent: "My Account" }),
      document.createTextNode(" before ordering."),
    );
  }
  return checkoutIdentity;
}

function configurePaymentOptions() {
  const enabled = !!window.LuxePaymentConfig?.providers?.paystack?.enabled;
  const radio = document.getElementById("paystackPayment");
  const option = document.getElementById("paystackOption");
  if (radio) radio.disabled = !enabled;
  option?.classList.toggle("is-disabled", !enabled);
  if (enabled) option?.querySelector("em")?.remove();
}

function value(id) { return document.getElementById(id)?.value.trim() || ""; }
function getCheckoutCartItems() {
  try { return window.loadCart ? window.loadCart() : JSON.parse(localStorage.getItem("luxe_cart") || "[]"); }
  catch { return []; }
}
function getProduct(id) { return window.getProductById?.(id) || (window.products || []).find((p) => p.id === id); }
function currency(amount) { return `$${Number(amount || 0).toFixed(2)}`; }

async function applyPromoCode() {
  const input = document.getElementById("promoCode");
  const button = document.getElementById("applyPromoBtn");
  const code = String(input?.value || "").trim().toUpperCase();
  if (!code) {
    appliedPromoCode = null;
    updateOrderTotals();
    setPromoStatus("Enter a promo code.", "error");
    return;
  }
  const user = window.LuxeAuth?.isReady() ? await window.LuxeAuth.getCurrentUser() : null;
  if (!user) {
    setPromoStatus("Sign in before applying a promo code.", "error");
    return;
  }
  const items = getCheckoutCartItems().map((item) => ({ id: item.id, quantity: item.quantity }));
  if (!items.length) return setPromoStatus("Your cart is empty.", "error");
  if (button) { button.disabled = true; button.textContent = "Checking…"; }
  const { data, error } = await window.LuxeOrders.quote(items, code);
  if (button) { button.disabled = false; button.textContent = "Apply"; }
  if (error || !data?.promotionCode) {
    appliedPromoCode = null;
    updateOrderTotals();
    setPromoStatus(error?.message || "Promo code could not be applied.", "error");
    return;
  }
  appliedPromoCode = data.promotionCode;
  if (input) input.value = appliedPromoCode;
  renderOrderTotals(data);
  setPromoStatus(`${data.percentOff}% discount applied.`, "success");
}

function setPromoStatus(message, state = "") {
  const status = document.getElementById("promoStatus");
  if (!status) return;
  status.textContent = message;
  status.className = `promo-status${state ? ` is-${state}` : ""}`;
}

function loadCheckoutItems() {
  const container = document.getElementById("orderItems");
  if (!container) return;
  const items = getCheckoutCartItems();
  if (!items.length) {
    container.innerHTML = '<div class="checkout-empty"><p>Your cart is empty</p><a href="shop.html" class="btn btn-primary">Shop Now</a></div>';
    return;
  }
  container.innerHTML = items.map((item) => {
    const product = getProduct(item.id);
    if (!product) return "";
    return `<div class="order-item"><img src="${escapeCheckoutAttr(product.image)}" alt="${escapeCheckoutAttr(product.name)}"><div class="order-item-details"><h4>${escapeCheckoutHtml(product.name)}</h4><p>Qty: ${item.quantity} × ${currency(product.price)}</p></div><strong>${currency(product.price * item.quantity)}</strong></div>`;
  }).join("");
}

function updateOrderTotals() {
  const subtotal = getCheckoutCartItems().reduce((sum, item) => {
    const product = getProduct(item.id);
    return sum + (product ? product.price * item.quantity : 0);
  }, 0);
  const shipping = subtotal ? (subtotal > 200 ? 0 : 15) : 0;
  const tax = subtotal * 0.08;
  renderOrderTotals({ subtotal, shipping, discount: 0, tax, total: subtotal + shipping + tax });
}

function renderOrderTotals(totals) {
  const discount = Number(totals.discount || 0);
  document.getElementById("checkoutSubtotal").textContent = currency(totals.subtotal);
  document.getElementById("checkoutShipping").textContent = Number(totals.shipping) ? currency(totals.shipping) : "Free";
  document.getElementById("checkoutTax").textContent = currency(totals.tax);
  document.getElementById("checkoutTotal").textContent = currency(totals.total);
  const row = document.getElementById("promoDiscountRow");
  if (row) row.hidden = discount <= 0;
  const valueElement = document.getElementById("checkoutDiscount");
  if (valueElement) valueElement.textContent = `-${currency(discount)}`;
}

function validateCheckoutForm() {
  const invalid = [];
  const mark = (id, valid, label) => {
    const field = document.getElementById(id);
    if (!field) return;
    field.classList.toggle("field-invalid", !valid);
    field.setAttribute("aria-invalid", String(!valid));
    if (!valid) invalid.push({ field, label });
  };

  mark("firstName", value("firstName").length >= 1, "first name");
  mark("lastName", value("lastName").length >= 1, "last name");
  mark("email", /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value("email")), "email address");
  const normalizedPhone = window.LuxeWhatsApp?.normalizePhone(
    value("phone"),
    checkoutIdentity.defaultCountryCode,
  );
  mark("phone", !!normalizedPhone, "phone number");
  mark("address", value("address").length >= 5, "street address");
  mark("city", value("city").length >= 2, "city");
  mark("state", value("state").length >= 2, "state or region");

  const consent = document.getElementById("whatsappConsent");
  const consentLabel = consent?.closest(".whatsapp-consent");
  consentLabel?.classList.toggle("field-invalid-group", !consent?.checked);
  consent?.setAttribute("aria-invalid", String(!consent?.checked));
  if (!consent?.checked) invalid.push({ field: consent, label: "WhatsApp order-update consent" });

  if (invalid.length) {
    const labels = [...new Set(invalid.map((item) => item.label))];
    showCheckoutError(`Please check ${labels.join(", ")}.`, invalid[0].field);
    return false;
  }
  document.querySelector(".checkout-error")?.remove();
  return true;
}

function getCheckoutIdempotencyKey(payload) {
  const fingerprint = JSON.stringify(payload);
  if (checkoutAttemptMemory?.fingerprint === fingerprint) return checkoutAttemptMemory.key;
  try {
    const saved = JSON.parse(sessionStorage.getItem("luxe_checkout_attempt") || "null");
    if (saved?.fingerprint === fingerprint && saved?.key) return saved.key;
  } catch { /* Create a fresh attempt below. */ }

  const key = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() :
    "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
      const random = Math.floor(Math.random() * 16);
      const value = character === "x" ? random : (random & 0x3) | 0x8;
      return value.toString(16);
    });
  checkoutAttemptMemory = { fingerprint, key };
  try { sessionStorage.setItem("luxe_checkout_attempt", JSON.stringify(checkoutAttemptMemory)); }
  catch { /* The key still protects this in-page submission. */ }
  return key;
}

function clearCheckoutAttempt() {
  checkoutAttemptMemory = null;
  try { sessionStorage.removeItem("luxe_checkout_attempt"); } catch { /* Storage may be unavailable. */ }
}

function buildAdminWhatsAppUrl(order, cartItems, contact, address) {
  const items = cartItems.map((item) => {
    const product = getProduct(item.id);
    return product ? `• ${product.name} ×${item.quantity} — ${currency(product.price * item.quantity)}` : "";
  }).filter(Boolean).join("\n");
  const message = [
    `NEW ${checkoutBrandName().toUpperCase()} ORDER ${order.order_number}`, "", items, "",
    order.promotionCode ? `Promo: ${order.promotionCode} (-${currency(order.discount)})` : "",
    `Total: ${currency(order.total)}`,
    `Customer: ${contact.name}`,
    `Phone: ${contact.phone}`,
    `Email: ${contact.email}`,
    `Deliver to: ${address.address}, ${address.city}, ${address.state} ${address.zip}`,
    "", "Please confirm this order and the estimated delivery date.",
  ].filter((line, index, lines) => line !== "" || (index > 0 && lines[index - 1] !== "")).join("\n");
  return `https://wa.me/${window.LuxePaymentConfig.adminWhatsApp}?text=${encodeURIComponent(message)}`;
}

function renderOrderSuccess(order, chatUrl, chatOpened) {
  const grid = document.querySelector(".checkout-grid");
  if (!grid) return;
  grid.innerHTML = `<div class="checkout-success"><i class="fas fa-check-circle"></i><h2>Order saved successfully</h2><p>Your order <strong>${escapeCheckoutHtml(order.order_number)}</strong> is now in your account and the admin console.</p><p class="success-note">${chatOpened ? `Complete the WhatsApp message in the new tab so ${escapeCheckoutHtml(checkoutBrandName())} can confirm fulfilment.` : "WhatsApp did not open automatically. Use the button below to send the order."}</p><div class="checkout-success-actions"><a href="${escapeCheckoutAttr(chatUrl)}" target="_blank" rel="noopener" class="btn btn-whatsapp"><i class="fab fa-whatsapp"></i> Send on WhatsApp</a><a href="dashboard.html" class="btn btn-primary"><i class="fas fa-box"></i> Track order</a><a href="shop.html" class="btn btn-outline">Continue shopping</a></div></div>`;
}

function setButtonState(button, disabled, label) {
  if (!button) return;
  button.disabled = disabled;
  button.innerHTML = disabled ? `<i class="fas fa-spinner fa-spin"></i> ${label}` : label;
}
function showCheckoutError(message, field = null) {
  document.querySelector(".checkout-error")?.remove();
  const box = document.createElement("div");
  box.className = "checkout-error";
  box.setAttribute("role", "alert");
  box.textContent = message;
  document.querySelector(".checkout-form-wrapper")?.prepend(box);
  if (field instanceof HTMLElement) {
    field.focus({ preventScroll: true });
    field.scrollIntoView({ behavior: "smooth", block: "center" });
  } else {
    box.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

document.addEventListener("input", (event) => {
  const field = event.target.closest?.("#checkoutForm input");
  if (!field) return;
  field.classList.remove("field-invalid");
  field.removeAttribute("aria-invalid");
  field.closest(".whatsapp-consent")?.classList.remove("field-invalid-group");
});

function prefillSavedAddress() {
  try {
    const user = JSON.parse(localStorage.getItem("luxe_user") || "null");
    if (!user?.email) return;
    const addresses = JSON.parse(localStorage.getItem(`luxe_addresses_${user.email}`) || "[]");
    const address = addresses.find((item) => item.isDefault) || addresses[0];
    const names = String(address?.fullName || user.fullName || "").split(" ");
    const values = { firstName: names.shift() || "", lastName: names.join(" "), email: user.email || "", phone: address?.phone || user.phone || "", address: address?.street || "", city: address?.city || "", state: address?.state || "", zip: address?.zip || "" };
    Object.entries(values).forEach(([id, content]) => { const input = document.getElementById(id); if (input && content) input.value = content; });
  } catch { /* Ignore malformed legacy local storage. */ }
}

function escapeCheckoutHtml(value) { const div = document.createElement("div"); div.textContent = String(value || ""); return div.innerHTML; }
function escapeCheckoutAttr(value) { return escapeCheckoutHtml(value).replace(/`/g, "&#96;"); }
