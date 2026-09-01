// Secure WhatsApp-first checkout. Prices are recalculated by PostgreSQL.
let checkoutAttemptMemory = null;
let appliedPromoCode = null;
let checkoutQuoteGeneration = 0;
let checkoutIdentity = {
  user: null,
  required: false,
  defaultCountryCode: "234",
  verifiedPhone: null,
};
let checkoutIdentityReady = Promise.resolve(checkoutIdentity);
let checkoutPaymentConfig = null;
let checkoutPaymentConfigReady = Promise.resolve(null);
const checkoutBrandName = () => window.LuxeBrand?.name || "ALKEBULAN";

document.addEventListener("DOMContentLoaded", async () => {
  if (window.productsReady) await window.productsReady;
  if (window.syncStorefrontNavigation) await window.syncStorefrontNavigation();
  const loader = document.getElementById("loader");
  if (loader) setTimeout(() => { loader.style.display = "none"; }, 250);

  checkoutPaymentConfigReady = loadPaymentConfig();
  checkoutPaymentConfig = await checkoutPaymentConfigReady;
  configurePaymentOptions();
  prefillSavedAddress();
  checkoutIdentityReady = loadCheckoutIdentity();
  await checkoutIdentityReady;
  loadCheckoutItems();
  const initialQuote = await updateOrderTotals();
  if (initialQuote.error && getCheckoutCartItems().length) {
    showCheckoutError(`The secure order total could not be calculated: ${initialQuote.error.message}`);
  }

  document.getElementById("applyPromoBtn")?.addEventListener("click", applyPromoCode);
  document.getElementById("promoCode")?.addEventListener("input", () => {
    if (!appliedPromoCode) return;
    appliedPromoCode = null;
    setPromoStatus("Code changed. Apply it again to update the total.");
    void updateOrderTotals();
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

    const paymentConfig = await checkoutPaymentConfigReady;
    const provider = document.querySelector('input[name="payment"]:checked:not(:disabled)')?.value;
    if (!provider) return showCheckoutError("No order method is currently available. Please try again shortly.");
    const providerConfig = paymentConfig?.providers?.[provider];
    if (!providerConfig?.enabled) return showCheckoutError("That payment option is not available yet.");
    if (provider === "whatsapp" && !getAdminWhatsAppNumber(paymentConfig)) {
      return showCheckoutError("WhatsApp ordering is temporarily unavailable. Please try again shortly.");
    }

    const whatsappWindow = provider === "whatsapp" ? window.open("about:blank", "_blank") : null;
    const button = form.querySelector(".checkout-btn");
    setButtonState(button, true, "Confirming secure total…");
    const quoteResult = await updateOrderTotals();
    if (quoteResult.error || !quoteResult.data) {
      whatsappWindow?.close();
      setButtonState(button, false, "Place Order");
      showCheckoutError(`The order total could not be confirmed: ${quoteResult.error?.message || "Please try again."}`);
      return;
    }

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
    const items = cartItems.map((item) => ({
      id: item.id,
      quantity: item.quantity,
      size: item.size || null,
      color: item.color || null,
    }));
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

    const chatUrl = buildAdminWhatsAppUrl(order, cartItems, contact, shippingAddress, paymentConfig);
    if (provider === "whatsapp" && whatsappWindow && chatUrl) {
      whatsappWindow.location.href = chatUrl;
    } else if (provider === "whatsapp") {
      whatsappWindow?.close();
    }

    const notificationPromise = window.LuxeOrders
      .sendWhatsAppNotifications("order_created", order.id)
      .catch((notifyError) => {
        console.warn("[ALKEBULAN] Order notifications were not sent:", notifyError);
        return { data: null, error: notifyError };
      });

    if (provider !== "whatsapp") {
      // Do not navigate away until the server has accepted the admin/customer
      // notification job; otherwise the browser can abort it mid-request.
      const beginPayment = window.LuxePaymentProviders?.begin;
      const [payment] = await Promise.all([
        typeof beginPayment === "function"
          ? beginPayment(provider, order)
          : Promise.resolve({ ok: false, error: "Secure payments are temporarily unavailable." }),
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
    renderOrderSuccess(order, chatUrl, !!(whatsappWindow && chatUrl));
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

async function loadPaymentConfig() {
  try {
    const config = window.LuxePaymentConfigReady
      ? await window.LuxePaymentConfigReady
      : window.LuxePaymentConfig;
    return config && typeof config === "object" ? config : null;
  } catch (error) {
    console.warn("[ALKEBULAN] Payment configuration is unavailable:", error);
    return null;
  }
}

function getAdminWhatsAppNumber(config = checkoutPaymentConfig) {
  const digits = String(config?.adminWhatsApp || "").replace(/\D/g, "");
  return /^[1-9]\d{6,14}$/.test(digits) ? digits : null;
}

function configurePaymentOptions() {
  const options = [
    { provider: "whatsapp", radio: document.getElementById("whatsappOrder") },
    { provider: "paystack", radio: document.getElementById("paystackPayment") },
  ];
  options.forEach(({ provider, radio }) => {
    const configured = !!checkoutPaymentConfig?.providers?.[provider]?.enabled;
    const enabled = configured && (provider !== "whatsapp" || !!getAdminWhatsAppNumber());
    if (!radio) return;
    radio.disabled = !enabled;
    if (!enabled) radio.checked = false;
    const option = radio.closest(".checkout-provider-option");
    option?.classList.toggle("is-disabled", !enabled);
    if (provider === "paystack" && enabled) option?.querySelector("em")?.remove();
  });

  const enabledOptions = options.filter(({ radio }) => radio && !radio.disabled);
  const preferred = enabledOptions.find(({ provider }) => provider === checkoutPaymentConfig?.activeProvider)
    || enabledOptions[0];
  if (preferred?.radio) preferred.radio.checked = true;
}

function value(id) { return document.getElementById(id)?.value.trim() || ""; }
function getCheckoutCartItems() {
  try {
    if (window.getAvailableCartItems) return window.getAvailableCartItems({ purge: true });
    return window.loadCart ? window.loadCart() : JSON.parse(localStorage.getItem("luxe_cart") || "[]");
  }
  catch { return []; }
}
function getProduct(id) { return window.getProductById?.(id) || (window.products || []).find((p) => p.id === id); }
function currency(amount) { return `${window.LuxeMoney?.formatUSD(amount) || `$${Number(amount || 0).toFixed(2)}`} USD`; }

async function applyPromoCode() {
  const input = document.getElementById("promoCode");
  const button = document.getElementById("applyPromoBtn");
  const code = String(input?.value || "").trim().toUpperCase();
  if (!code) {
    appliedPromoCode = null;
    void updateOrderTotals();
    setPromoStatus("Enter a promo code.", "error");
    return;
  }
  const user = window.LuxeAuth?.isReady() ? await window.LuxeAuth.getCurrentUser() : null;
  if (!user) {
    setPromoStatus("Sign in before applying a promo code.", "error");
    return;
  }
  if (!getCheckoutCartItems().length) return setPromoStatus("Your cart is empty.", "error");
  if (button) { button.disabled = true; button.textContent = "Checking…"; }
  const { data, error } = await updateOrderTotals({ promoCode: code });
  if (error || !data?.promotionCode) {
    appliedPromoCode = null;
    await updateOrderTotals();
    if (button) { button.disabled = false; button.textContent = "Apply"; }
    setPromoStatus(error?.message || "Promo code could not be applied.", "error");
    return;
  }
  appliedPromoCode = data.promotionCode;
  if (button) { button.disabled = false; button.textContent = "Apply"; }
  if (input) input.value = appliedPromoCode;
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
    const options = [
      item.size ? `Size: ${escapeCheckoutHtml(item.size)}` : "",
      item.color ? `Colour: ${escapeCheckoutHtml(item.color)}` : "",
    ].filter(Boolean).join(" · ");
    const localPrice = window.LuxeMoney?.formatNGN(product.priceNGN) || "";
    return `<div class="order-item"><img ${window.LuxeMedia.attributes(product.image, { preset: "compact", alt: product.name })}><div class="order-item-details"><h4>${escapeCheckoutHtml(product.name)}</h4><p>Qty: ${Math.max(1, Math.min(99, Number(item.quantity) || 1))} × ${escapeCheckoutHtml(currency(product.price))}${localPrice ? ` <small>(${escapeCheckoutHtml(localPrice)})</small>` : ""}</p>${options ? `<p class="order-item-options">${options}</p>` : ""}</div><strong>${escapeCheckoutHtml(currency(product.price * item.quantity))}</strong></div>`;
  }).join("");
  window.LuxeMedia.hydrate(container);
}

async function updateOrderTotals({ promoCode = appliedPromoCode } = {}) {
  const generation = ++checkoutQuoteGeneration;
  const cartItems = getCheckoutCartItems();
  const items = cartItems.map((item) => ({
    id: item.id,
    quantity: item.quantity,
    size: item.size || null,
    color: item.color || null,
  }));
  const localSubtotal = cartItems.reduce((sum, item) => {
    const product = getProduct(item.id);
    return sum + (product ? Number(product.price) * Number(item.quantity) : 0);
  }, 0);

  if (!items.length) {
    renderOrderTotals({ subtotal: 0, shipping: 0, discount: 0, tax: 0, total: 0 });
    return { data: null, error: { message: "Your cart is empty." } };
  }

  renderOrderTotalsPending(localSubtotal, !!promoCode);
  if (!window.LuxeOrders?.quote) {
    renderOrderTotalsUnavailable(localSubtotal);
    return { data: null, error: { message: "The secure order service is unavailable." } };
  }

  const { data, error } = await window.LuxeOrders.quote(items, promoCode || null);
  if (generation !== checkoutQuoteGeneration) {
    return { data: null, error: { message: "A newer total is being calculated." }, stale: true };
  }
  if (error || !isValidOrderQuote(data)) {
    renderOrderTotalsUnavailable(localSubtotal);
    return {
      data: null,
      error: { message: error?.message || "The order service returned an invalid total." },
    };
  }

  if (!renderOrderTotals(data)) {
    return {
      data: null,
      error: { message: "The checkout summary is unavailable. Please reload the page and try again." },
    };
  }
  return { data, error: null };
}

function isValidOrderQuote(data) {
  return !!data && ["subtotal", "shipping", "discount", "tax", "total"].every((key) => {
    if (!Object.prototype.hasOwnProperty.call(data, key)) return false;
    const amount = Number(data[key]);
    return Number.isFinite(amount) && amount >= 0;
  });
}

function renderOrderTotalsPending(subtotal, hasPromoCode = false) {
  const subtotalElement = document.getElementById("checkoutSubtotal");
  if (subtotalElement) subtotalElement.textContent = currency(subtotal);
  const discountRow = document.getElementById("promoDiscountRow");
  if (discountRow && !hasPromoCode) discountRow.hidden = true;
  ["checkoutShipping", "checkoutTax", "checkoutTotal"].forEach((id) => {
    const element = document.getElementById(id);
    if (element) element.textContent = "Calculating…";
  });
}

function renderOrderTotalsUnavailable(subtotal) {
  const subtotalElement = document.getElementById("checkoutSubtotal");
  if (subtotalElement) subtotalElement.textContent = currency(subtotal);
  ["checkoutShipping", "checkoutTax", "checkoutTotal"].forEach((id) => {
    const element = document.getElementById(id);
    if (element) element.textContent = "Unavailable";
  });
}

function renderOrderTotals(totals) {
  const elements = {
    subtotal: document.getElementById("checkoutSubtotal"),
    shipping: document.getElementById("checkoutShipping"),
    tax: document.getElementById("checkoutTax"),
    total: document.getElementById("checkoutTotal"),
  };
  const discount = Number(totals?.discount || 0);
  if (elements.subtotal) elements.subtotal.textContent = currency(totals?.subtotal);
  if (elements.shipping) {
    elements.shipping.textContent = Number(totals?.shipping) ? currency(totals.shipping) : "Free";
  }
  if (elements.tax) elements.tax.textContent = currency(totals?.tax);
  if (elements.total) elements.total.textContent = currency(totals?.total);
  const row = document.getElementById("promoDiscountRow");
  if (row) row.hidden = discount <= 0;
  const valueElement = document.getElementById("checkoutDiscount");
  if (valueElement) valueElement.textContent = `-${currency(discount)}`;
  const missing = Object.entries(elements)
    .filter(([, element]) => !element)
    .map(([name]) => name);
  if (missing.length) {
    console.warn(`[ALKEBULAN] Checkout summary is missing: ${missing.join(", ")}.`);
    return false;
  }
  return true;
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

function buildAdminWhatsAppUrl(order, cartItems, contact, address, paymentConfig = checkoutPaymentConfig) {
  const adminWhatsApp = getAdminWhatsAppNumber(paymentConfig);
  if (!adminWhatsApp) return null;
  const items = cartItems.map((item) => {
    const product = getProduct(item.id);
    const options = [item.size ? `Size ${item.size}` : "", item.color ? `Colour ${item.color}` : ""].filter(Boolean).join(" / ");
    return product ? `• ${product.name}${options ? ` (${options})` : ""} ×${item.quantity} — ${currency(product.price * item.quantity)}` : "";
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
  return `https://wa.me/${adminWhatsApp}?text=${encodeURIComponent(message)}`;
}

function renderOrderSuccess(order, chatUrl, chatOpened) {
  const grid = document.querySelector(".checkout-grid");
  if (!grid) return;
  const whatsappAction = chatUrl
    ? `<a href="${escapeCheckoutAttr(chatUrl)}" target="_blank" rel="noopener" class="btn btn-whatsapp"><i class="fab fa-whatsapp"></i> Send on WhatsApp</a>`
    : "";
  const successNote = chatUrl
    ? (chatOpened
      ? `Complete the WhatsApp message in the new tab so ${escapeCheckoutHtml(checkoutBrandName())} can confirm fulfilment.`
      : "WhatsApp did not open automatically. Use the button below to send the order.")
    : "WhatsApp contact is temporarily unavailable. Your saved order can still be tracked in My Account.";
  grid.innerHTML = `<div class="checkout-success"><i class="fas fa-check-circle"></i><h2>Order saved successfully</h2><p>Your order <strong>${escapeCheckoutHtml(order.order_number)}</strong> is now in your account and the admin console.</p><p class="success-note">${successNote}</p><div class="checkout-success-actions">${whatsappAction}<a href="dashboard.html" class="btn btn-primary"><i class="fas fa-box"></i> Track order</a><a href="shop.html" class="btn btn-outline">Continue shopping</a></div></div>`;
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

function escapeCheckoutHtml(value) { return window.LuxeUtils.escapeHtml(value); }
function escapeCheckoutAttr(value) { return window.LuxeUtils.escapeAttr(value); }
