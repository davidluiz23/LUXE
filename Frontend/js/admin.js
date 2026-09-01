// js/admin.js - ALKEBULAN management console
//
// Database-enforced roles:
//   owner -> permanent master account; can manage admins + store
//   admin -> can manage products, uploads and site updates
//
// The frontend only changes visibility. PostgreSQL RPC/RLS is the
// actual security boundary.

let currentAdminUserId = null;
let currentAdminRole = null;
const adminBrandName = () => window.LuxeBrand?.name || "ALKEBULAN";

document.addEventListener("DOMContentLoaded", async () => {
  if (!window.LuxeAuth || !window.LuxeAuth.isReady()) {
    showToast("Backend not configured — check js/supabase-client.js", true);
    return;
  }

  const loginGate = document.getElementById("adminLoginGate");
  const deniedGate = document.getElementById("adminDeniedGate");
  const layout = document.getElementById("adminLayout");
  const teamNavButton = document.getElementById("teamNavBtn");
  const teamPanel = document.getElementById("teamPanel");
  const confirmationOverlay = document.getElementById("adminConfirmationOverlay");
  const confirmationInput = document.getElementById("adminConfirmationInput");
  const confirmationAccept = document.getElementById("acceptAdminConfirmation");
  let confirmationResolver = null;
  let confirmationReturnFocus = null;
  const confirmationBackgroundState = new Map();

  function setConfirmationBackgroundInert(active) {
    const backgroundElements = [...document.body.children].filter((element) =>
      element !== confirmationOverlay && !element.matches("script, style, link")
    );
    if (active) {
      confirmationBackgroundState.clear();
      backgroundElements.forEach((element) => {
        confirmationBackgroundState.set(element, !!element.inert);
        element.inert = true;
      });
      return;
    }
    confirmationBackgroundState.forEach((wasInert, element) => {
      if (element.isConnected) element.inert = wasInert;
    });
    confirmationBackgroundState.clear();
  }

  function closeAdminConfirmation(confirmed = false) {
    confirmationOverlay?.classList.remove("visible");
    confirmationOverlay?.setAttribute("aria-hidden", "true");
    setConfirmationBackgroundInert(false);
    document.body.classList.toggle(
      "admin-modal-open",
      !!document.querySelector(".admin-modal-overlay.visible"),
    );
    const returnFocus = confirmationReturnFocus;
    confirmationReturnFocus = null;
    const resolve = confirmationResolver;
    confirmationResolver = null;
    if (returnFocus instanceof HTMLElement && returnFocus.isConnected) {
      returnFocus.focus({ preventScroll: true });
    }
    if (resolve) resolve(confirmed);
  }

  function requestAdminConfirmation({ title, message, expectedText = "", danger = false }) {
    if (!confirmationOverlay) return Promise.resolve(false);
    if (confirmationResolver) closeAdminConfirmation(false);
    setText("adminConfirmationTitle", title || "Confirm sensitive action");
    setText("adminConfirmationMessage", message || "Review this change before continuing.");
    setText("adminConfirmationExpected", expectedText);
    const inputWrap = document.getElementById("adminConfirmationInputWrap");
    if (inputWrap) inputWrap.hidden = !expectedText;
    if (confirmationInput) confirmationInput.value = "";
    if (confirmationAccept) {
      confirmationAccept.disabled = !!expectedText;
      confirmationAccept.textContent = danger ? "Confirm action" : "Confirm";
      confirmationAccept.classList.toggle("admin-danger-btn", !!danger);
    }
    confirmationReturnFocus = document.activeElement;
    setConfirmationBackgroundInert(true);
    confirmationOverlay.setAttribute("aria-hidden", "false");
    confirmationOverlay.classList.add("visible");
    document.body.classList.add("admin-modal-open");
    setTimeout(() => (expectedText ? confirmationInput : confirmationAccept)?.focus(), 0);
    return new Promise((resolve) => { confirmationResolver = resolve; });
  }

  confirmationInput?.addEventListener("input", () => {
    if (confirmationAccept) {
      confirmationAccept.disabled = confirmationInput.value !== document.getElementById("adminConfirmationExpected")?.textContent;
    }
  });
  confirmationInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && confirmationAccept && !confirmationAccept.disabled) confirmationAccept.click();
  });
  confirmationAccept?.addEventListener("click", () => closeAdminConfirmation(true));
  document.getElementById("cancelAdminConfirmation")?.addEventListener("click", () => closeAdminConfirmation(false));
  confirmationOverlay?.addEventListener("click", (event) => {
    if (event.target === confirmationOverlay) closeAdminConfirmation(false);
  });
  confirmationOverlay?.addEventListener("keydown", (event) => {
    if (event.key !== "Tab") return;
    const focusable = [...confirmationOverlay.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
    )].filter((element) => !element.hidden && element.offsetParent !== null);
    if (!focusable.length) {
      event.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  function activatePanel(panelId) {
    document.querySelectorAll(".admin-nav-btn[data-panel]").forEach((button) => {
      button.classList.toggle("active", button.dataset.panel === panelId);
    });

    document.querySelectorAll(".admin-panel").forEach((panel) => {
      panel.classList.toggle("active", panel.id === panelId);
    });

    if (panelId === "ordersPanel") {
      window.LuxeOrders.markAllAdminSeen().then(({ error } = {}) => {
        if (!error) updateAdminOrderBadge(0);
      });
      loadOrders();
    }
    if (panelId === "presencePanel") {
      loadOnlineVisitors({ render: true });
    }
    if (panelId === "customersPanel") {
      loadCustomers();
      loadAdminActivity();
    }
    if (panelId === "promotionsPanel") {
      loadPromotions();
    }
    if (panelId === "activityPanel") {
      loadAdminActivity();
    }
  }

  async function checkAccess() {
    const user = await window.LuxeAuth.getCurrentUser();

    if (!user) {
      currentAdminUserId = null;
      currentAdminRole = null;
      loginGate.style.display = "block";
      deniedGate.style.display = "none";
      layout.classList.remove("visible");
      if (teamNavButton) teamNavButton.style.display = "none";
      return false;
    }

    const role = await window.LuxeAdmins.getRole();

    if (role !== "owner" && role !== "admin") {
      currentAdminUserId = null;
      currentAdminRole = null;
      loginGate.style.display = "none";
      deniedGate.style.display = "block";
      layout.classList.remove("visible");
      if (teamNavButton) teamNavButton.style.display = "none";
      return false;
    }

    currentAdminUserId = user.id;
    currentAdminRole = role;
    const presenceRequest = window.LuxeAdmins.touchPresence();
    const profileRequest = window.LuxeProfile?.get(user.id) || Promise.resolve(null);

    loginGate.style.display = "none";
    deniedGate.style.display = "none";
    layout.classList.add("visible");

    const emailEl = document.getElementById("adminOwnerEmail");
    if (emailEl) emailEl.textContent = user.email || "";

    profileRequest.then((profile) => renderAdminOwnerAvatar(profile?.avatar_url));

    const roleLabel = document.getElementById("adminRoleLabel");
    const roleBadge = document.getElementById("adminRoleBadge");

    if (role === "owner") {
      if (roleLabel) roleLabel.textContent = "Master Owner";
      if (roleBadge) {
        roleBadge.textContent = "OWNER";
        roleBadge.className = "admin-owner-role owner";
      }
      if (teamNavButton) teamNavButton.style.display = "flex";
    } else {
      if (roleLabel) roleLabel.textContent = "Administrator";
      if (roleBadge) {
        roleBadge.textContent = "ADMIN";
        roleBadge.className = "admin-owner-role admin";
      }
      if (teamNavButton) teamNavButton.style.display = "none";
      if (teamPanel?.classList.contains("active")) {
        activatePanel("productsPanel");
      }
    }

    await Promise.all([
      loadProducts(),
      loadUpdates(),
      refreshOrderBadge(),
      role === "owner" ? presenceRequest.then(() => loadTeam()) : presenceRequest,
    ]);
    window.LuxePush?.syncExisting().finally(refreshAdminPushControl);

    return true;
  }

  const loginForm = document.getElementById("adminLoginForm");
  const loginError = document.getElementById("adminLoginError");


  const forgotPasswordLink =
    document.getElementById("adminForgotPasswordLink");
  const resetModal =
    document.getElementById("adminResetModalOverlay");
  const resetCloseButton =
    document.getElementById("adminResetCloseBtn");
  const resetForm =
    document.getElementById("adminResetForm");
  const resetEmailInput =
    document.getElementById("adminResetEmail");
  const resetStatus =
    document.getElementById("adminResetStatus");
  const resetSubmitButton =
    document.getElementById("adminResetSubmitBtn");

  function openResetModal() {
    if (!resetModal) return;

    const currentEmail =
      document.getElementById("adminEmail")?.value.trim() || "";

    if (resetEmailInput && currentEmail) {
      resetEmailInput.value = currentEmail;
    }

    if (resetStatus) {
      resetStatus.textContent = "";
      resetStatus.className = "admin-reset-status";
    }

    if (resetForm) {
      resetForm.style.display = "block";
    }

    resetModal.classList.add("visible");
    resetModal.setAttribute("aria-hidden", "false");

    setTimeout(() => {
      resetEmailInput?.focus();
    }, 0);
  }

  function closeResetModal() {
    if (!resetModal) return;

    resetModal.classList.remove("visible");
    resetModal.setAttribute("aria-hidden", "true");
  }

  forgotPasswordLink?.addEventListener("click", (event) => {
    event.preventDefault();
    openResetModal();
  });

  resetCloseButton?.addEventListener("click", closeResetModal);

  resetModal?.addEventListener("click", (event) => {
    if (event.target === resetModal) {
      closeResetModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && confirmationOverlay?.classList.contains("visible")) {
      closeAdminConfirmation(false);
      return;
    }
    if (event.key === "Escape" && customerDetailOverlay?.classList.contains("visible")) {
      closeCustomerDetail();
      return;
    }
    if (
      event.key === "Escape" &&
      resetModal?.classList.contains("visible")
    ) {
      closeResetModal();
    }
  });

  resetForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = resetEmailInput?.value.trim() || "";

    if (!email) {
      if (resetStatus) {
        resetStatus.textContent = "Enter your email address.";
        resetStatus.className = "admin-reset-status error";
      }
      return;
    }

    if (!window.LuxeAuth || !window.LuxeAuth.isReady()) {
      if (resetStatus) {
        resetStatus.textContent =
          "Account service is unavailable right now.";
        resetStatus.className = "admin-reset-status error";
      }
      return;
    }

    if (resetSubmitButton) {
      resetSubmitButton.disabled = true;
      resetSubmitButton.textContent = "Sending...";
    }

    const { error } =
      await window.LuxeAuth.requestPasswordReset(email, "admin");

    if (resetSubmitButton) {
      resetSubmitButton.disabled = false;
      resetSubmitButton.textContent = "Send Reset Link";
    }

    // Intentionally show the same response whether or not the address
    // exists. This prevents the admin login page from revealing which
    // emails have ALKEBULAN accounts.
    if (error) {
      console.warn(
        "[ALKEBULAN] Admin password reset request:",
        error.message
      );
    }

    if (resetForm) {
      resetForm.style.display = "none";
    }

    if (resetStatus) {
      resetStatus.textContent =
        "If an account exists for that email, a password reset link has been sent. Check your inbox.";
      resetStatus.className = "admin-reset-status success";
    }
  });

  loginForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    loginError?.classList.remove("visible");

    const email = document.getElementById("adminEmail")?.value.trim() || "";
    const password = document.getElementById("adminPassword")?.value || "";
    const button = document.getElementById("adminLoginBtn");

    if (button) {
      button.disabled = true;
      button.textContent = "Signing in...";
    }

    const { error } = await window.LuxeAuth.signInWithPassword(email, password);

    if (button) {
      button.disabled = false;
      button.textContent = "Sign In";
    }

    if (error) {
      if (loginError) {
        loginError.textContent = error.message || "Sign in failed.";
        loginError.classList.add("visible");
      }
      return;
    }

    await checkAccess();
  });

  document.getElementById("adminSignOutBtn")?.addEventListener("click", async () => {
    await window.LuxeAuth.signOut();
    currentAdminUserId = null;
    currentAdminRole = null;
    await checkAccess();
  });

  document.getElementById("adminDeniedSignOut")?.addEventListener("click", async () => {
    await window.LuxeAuth.signOut();
    await checkAccess();
  });

  document.querySelectorAll(".admin-nav-btn[data-panel]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.panel === "teamPanel" && currentAdminRole !== "owner") {
        showToast("Only the master owner can manage the team.", true);
        return;
      }
      activatePanel(button.dataset.panel);
    });
  });

  const productsTableBody = document.getElementById("productsTableBody");
  const productsEmptyState = document.getElementById("productsEmptyState");
  const productCountLabel = document.getElementById("productCountLabel");
  const productModalOverlay = document.getElementById("productModalOverlay");
  const productForm = document.getElementById("productForm");
  const productModalTitle = document.getElementById("productModalTitle");
  let adminProductCache = new Map();
  let activeProductUploads = 0;
  const productPreviewObjectUrls = new Map();
  const productUploadMetadata = new Map();
  const adminOrdersList = document.getElementById("adminOrdersList");
  const adminOrdersEmpty = document.getElementById("adminOrdersEmpty");
  const adminOrderCount = document.getElementById("adminOrderCount");
  const adminOrdersEmptyMessage = document.getElementById("adminOrdersEmptyMessage");
  const adminOrderSearchForm = document.getElementById("adminOrderSearchForm");
  const adminOrderSearchInput = document.getElementById("adminOrderSearchInput");
  const adminOrderSearchStatus = document.getElementById("adminOrderSearchStatus");
  const clearAdminOrderSearch = document.getElementById("clearAdminOrderSearch");
  const adminOrdersPagination = document.getElementById("adminOrdersPagination");
  const loadMoreAdminOrders = document.getElementById("loadMoreAdminOrders");
  const adminPushToggle = document.getElementById("adminPushToggle");
  const onlineVisitorBadge = document.getElementById("onlineVisitorBadge");
  const onlineVisitorsList = document.getElementById("onlineVisitorsList");
  const onlineVisitorsEmpty = document.getElementById("onlineVisitorsEmpty");
  const refreshPresenceBtn = document.getElementById("refreshPresenceBtn");
  let activeOrderSearch = "";
  let adminOrderRows = [];
  let adminOrderNextCursor = null;
  let adminOrderHasMore = false;
  let adminOrdersLoading = false;
  let presenceLoading = false;
  let onlineCustomerIds = new Set();
  let customerPresenceAvailable = true;

  function updateAdminOrderBadge(count) {
    const badge = document.getElementById("adminOrderBadge");
    if (!badge) return;
    badge.textContent = count > 99 ? "99+" : String(count);
    badge.hidden = count < 1;
  }

  function renderAdminOwnerAvatar(avatarUrl) {
    const image = document.getElementById("adminOwnerAvatarImage");
    const fallback = document.getElementById("adminOwnerAvatarFallback");
    if (!image || !fallback) return;

    const showFallback = () => {
      image.hidden = true;
      image.removeAttribute("src");
      fallback.hidden = false;
    };

    if (!isSafeHttpsUrl(avatarUrl)) {
      showFallback();
      return;
    }

    image.onload = () => {
      image.hidden = false;
      fallback.hidden = true;
    };
    image.onerror = showFallback;
    image.src = avatarUrl;
  }

  async function refreshOrderBadge() {
    const { data, error } = await window.LuxeOrders.getAdminUnseenCount();
    if (!error) updateAdminOrderBadge(Number(data) || 0);
  }

  async function loadOrders({ append = false } = {}) {
    if (!adminOrdersList || adminOrdersLoading) return;
    adminOrdersLoading = true;
    adminOrdersList.setAttribute("aria-busy", "true");
    const search = activeOrderSearch.trim();
    if (!append) {
      adminOrderRows = [];
      adminOrderNextCursor = null;
      adminOrderHasMore = false;
      adminOrdersList.innerHTML = "";
      if (adminOrdersEmpty) adminOrdersEmpty.style.display = "none";
      if (adminOrdersPagination) adminOrdersPagination.hidden = true;
      if (adminOrderCount) adminOrderCount.textContent = search ? "Finding matching orders…" : "Loading customer orders…";
      if (adminOrderSearchStatus) adminOrderSearchStatus.textContent = search ? `Searching for “${search}”…` : "";
    }
    if (loadMoreAdminOrders) {
      loadMoreAdminOrders.disabled = true;
      loadMoreAdminOrders.textContent = append ? "Loading more…" : "Load more orders";
    }

    const { data: page, error } = await window.LuxeOrders.getAdminOrdersPage({
      search,
      limit: 40,
      cursor: append ? adminOrderNextCursor : null,
    });
    adminOrdersLoading = false;
    adminOrdersList.removeAttribute("aria-busy");
    if (error) {
      if (adminOrderCount) adminOrderCount.textContent = append ? "Could not load more orders." : "Could not load orders.";
      if (adminOrderSearchStatus) adminOrderSearchStatus.textContent = error.message || "Search failed.";
      if (clearAdminOrderSearch) clearAdminOrderSearch.hidden = !search;
      if (!append) {
        adminOrderRows = [];
        adminOrderNextCursor = null;
        adminOrderHasMore = false;
        adminOrdersList.innerHTML = "";
        if (adminOrdersEmptyMessage) {
          adminOrdersEmptyMessage.textContent = search
            ? `Orders matching “${search}” could not be loaded.`
            : "Customer orders could not be loaded.";
        }
        if (adminOrdersEmpty) adminOrdersEmpty.style.display = "block";
        if (adminOrdersPagination) adminOrdersPagination.hidden = true;
      } else if (adminOrdersPagination) {
        adminOrdersPagination.hidden = !adminOrderRows.length;
      }
      if (loadMoreAdminOrders) {
        loadMoreAdminOrders.disabled = !append;
        loadMoreAdminOrders.textContent = append ? "Try loading more again" : "Load more orders";
      }
      showToast(error.message || "Failed to load orders", true);
      return;
    }

    const incomingOrders = Array.isArray(page?.orders) ? page.orders : [];
    if (append) {
      const uniqueOrders = new Map(adminOrderRows.map((order) => [String(order.id), order]));
      incomingOrders.forEach((order) => uniqueOrders.set(String(order.id), order));
      adminOrderRows = [...uniqueOrders.values()];
    } else {
      adminOrderRows = incomingOrders;
    }
    adminOrderHasMore = page?.hasMore === true;
    adminOrderNextCursor = page?.nextCursor || null;
    const orders = adminOrderRows;

    if (adminOrdersPagination) adminOrdersPagination.hidden = !adminOrderHasMore || !orders.length;
    if (loadMoreAdminOrders) {
      loadMoreAdminOrders.disabled = !adminOrderHasMore;
      loadMoreAdminOrders.textContent = "Load more orders";
    }

    const unseen = orders.filter((order) => !order.admin_seen_at).length;
    if (!search) updateAdminOrderBadge(unseen);
    if (adminOrderCount) {
      adminOrderCount.textContent = search
        ? `${orders.length}${adminOrderHasMore ? "+" : ""} matching order${orders.length === 1 ? "" : "s"}`
        : `${orders.length}${adminOrderHasMore ? "+" : ""} order${orders.length === 1 ? "" : "s"} loaded · ${unseen} new`;
    }
    if (adminOrderSearchStatus) {
      adminOrderSearchStatus.textContent = !search
        ? ""
        : orders.length
          ? `Showing ${orders.length} order${orders.length === 1 ? "" : "s"} matching “${search}”${adminOrderHasMore ? "; more are available." : "."}`
          : `No orders match “${search}”.`;
    }
    if (clearAdminOrderSearch) clearAdminOrderSearch.hidden = !search;
    if (adminOrdersEmptyMessage) {
      adminOrdersEmptyMessage.textContent = search ? `No order matches “${search}”.` : "No customer orders yet.";
    }
    adminOrdersEmpty.style.display = orders.length ? "none" : "block";
    if (!orders.length) {
      adminOrdersList.innerHTML = "";
      if (adminOrdersPagination) adminOrdersPagination.hidden = true;
      return;
    }

    adminOrdersList.innerHTML = orders.map((order) => {
      const address = order.shipping_address || {};
      const addressText = [address.address, address.city, address.state, address.zip].filter(Boolean).join(", ");
      const items = (order.order_items || []).map((item) => `
        <div class="admin-order-item">
          <img ${window.LuxeMedia.attributes(item.image_url || "", { preset: "compact", alt: "" })}>
          <div class="admin-order-item-copy">
            <span>${escapeAdminHtml(item.product_name)} ×${Number(item.quantity)}</span>
            <small>${escapeAdminHtml(item.product_reference || formatProductReference(item.product_id))}</small>
            ${item.selected_size || item.selected_color
              ? `<small>${[
                  item.selected_size ? `Size: ${escapeAdminHtml(item.selected_size)}` : "",
                  item.selected_color ? `Colour: ${escapeAdminHtml(item.selected_color)}` : "",
                ].filter(Boolean).join(" · ")}</small>`
              : ""}
          </div>
          <strong>$${(Number(item.price) * Number(item.quantity)).toFixed(2)}</strong>
        </div>`).join("");
      const customerMessage = encodeURIComponent(`Hi ${order.contact_name || "there"}, here is an update for ${adminBrandName()} order ${order.order_number}.`);
      const customerPhone = String(order.contact_phone || "").replace(/\D/g, "").replace(/^0/, "234");

      const attribution = order.last_admin_changed_at
        ? `<p class="admin-order-attribution"><i class="fas fa-user-check"></i> ${escapeAdminHtml(formatAdminAction(order.last_admin_action))} by ${escapeAdminHtml(order.last_admin_email || "Administrator")} · ${new Date(order.last_admin_changed_at).toLocaleString()}</p>`
        : "";
      return `<article class="admin-order-card ${order.admin_seen_at ? "" : "is-new"}" data-order-id="${escapeAttr(order.id)}" data-order-number="${escapeAttr(order.order_number)}" data-updated-at="${escapeAttr(order.updated_at)}" data-order-version="${escapeAttr(order.admin_version ?? 0)}">
        <header class="admin-order-header">
          <div><strong>${escapeAdminHtml(order.order_number)}</strong><span>${new Date(order.created_at).toLocaleString()}</span></div>
          <div><span class="admin-order-status">${escapeAdminHtml(String(order.status).replaceAll("_", " "))}</span><strong>$${Number(order.total).toFixed(2)}</strong>${Number(order.discount_amount || 0) > 0 ? `<small>Promo ${escapeAdminHtml(order.promotion_code || "")} · -$${Number(order.discount_amount).toFixed(2)}</small>` : ""}</div>
        </header>
        <div class="admin-order-grid">
          <div class="admin-order-customer">
            <h4>Customer & delivery</h4>
            <p><strong>${escapeAdminHtml(order.contact_name || "—")}</strong></p>
            <p><a href="tel:${escapeAttr(order.contact_phone || "")}">${escapeAdminHtml(order.contact_phone || "—")}</a> · <a href="mailto:${escapeAttr(order.contact_email || "")}">${escapeAdminHtml(order.contact_email || "—")}</a></p>
            <p>${escapeAdminHtml(addressText || "No delivery address")}</p>
            <p class="admin-payment-line">${escapeAdminHtml(order.payment_provider || "whatsapp")} ${order.payment_channel ? `· ${escapeAdminHtml(order.payment_channel)}` : ""} · ${escapeAdminHtml(order.payment_status || "pending")}${order.payment_method_label ? `<br>${escapeAdminHtml(order.payment_method_label)}` : ""}${order.payment_reference ? `<span class="admin-payment-reference">Payment ref: ${escapeAdminHtml(order.payment_reference)}</span>` : ""}</p>
            ${attribution}
            <a class="admin-whatsapp-link" href="https://wa.me/${customerPhone}?text=${customerMessage}" target="_blank" rel="noopener"><i class="fab fa-whatsapp"></i> Message customer</a>
          </div>
          <div class="admin-order-items"><h4>Items</h4>${items}</div>
        </div>
        <form class="admin-order-fulfilment">
          <label>Status<select name="status">${["pending_confirmation","awaiting_payment","processing","confirmed","shipped","delivered","cancelled"].map((status) => `<option value="${status}" ${status === order.status ? "selected" : ""}>${status.replaceAll("_", " ")}</option>`).join("")}</select></label>
          <label>ETA from (days)<input name="etaMin" type="number" min="1" max="90" value="${escapeAttr(order.estimated_delivery_min_days || "")}" placeholder="2"></label>
          <label>ETA to (days)<input name="etaMax" type="number" min="1" max="120" value="${escapeAttr(order.estimated_delivery_max_days || "")}" placeholder="5"></label>
          <label class="waybill-field">Waybill / tracking URL<input name="waybill" type="url" maxlength="1000" value="${escapeAttr(order.waybill_url || "")}" placeholder="https://…"></label>
          <button class="btn btn-primary" type="submit">Save order</button>
        </form>
      </article>`;
    }).join("");

    if (search && orders.length && !append) {
      const exactOrder = [...adminOrdersList.querySelectorAll(".admin-order-card")].find(
        (card) => card.dataset.orderNumber?.toLowerCase() === search.toLowerCase(),
      );
      const match = exactOrder || (orders.length === 1 ? adminOrdersList.querySelector(".admin-order-card") : null);
      if (match) {
        match.classList.add("is-search-match");
        requestAnimationFrame(() => match.scrollIntoView({ behavior: "smooth", block: "start" }));
        window.setTimeout(() => match.classList.remove("is-search-match"), 3600);
      }
    }

    adminOrdersList.querySelectorAll(".admin-order-fulfilment").forEach((form) => {
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const card = form.closest(".admin-order-card");
        const button = form.querySelector('button[type="submit"]');
        const orderNumber = card.dataset.orderNumber;
        const nextStatus = form.elements.status.value;
        const waybillUrl = form.elements.waybill.value.trim();
        if (waybillUrl && !isSafeHttpsUrl(waybillUrl)) {
          showToast("Tracking links must use a secure https:// URL.", true);
          form.elements.waybill.focus();
          return;
        }
        const isCancellation = nextStatus === "cancelled";
        const confirmed = await requestAdminConfirmation({
          title: isCancellation ? `Cancel ${orderNumber}?` : `Confirm changes to ${orderNumber}?`,
          message: isCancellation
            ? "Cancelling an order affects fulfilment, promo usage and customer notifications. This action will be attributed to your admin account."
            : `Save this order as ${nextStatus.replaceAll("_", " ")}? The customer account will update immediately and WhatsApp will be attempted separately when configured.`,
          expectedText: isCancellation ? `CANCEL ${orderNumber}` : "",
          danger: isCancellation,
        });
        if (!confirmed) return;
        button.disabled = true;
        button.textContent = "Saving…";
        const { error } = await window.LuxeOrders.updateAdminOrder(card.dataset.orderId, {
          status: nextStatus,
          estimatedMinDays: Number(form.elements.etaMin.value) || null,
          estimatedMaxDays: Number(form.elements.etaMax.value) || null,
          waybillUrl,
          expectedVersion: Number(card.dataset.orderVersion),
          expectedUpdatedAt: card.dataset.updatedAt,
        });
        button.disabled = false;
        button.textContent = "Save order";
        if (error) {
          const message = String(error.message || "");
          showToast(
            message.includes("ORDER_CONFLICT")
              ? "Another administrator changed this order. The latest version has been loaded."
              : message || "Could not update order",
            true,
          );
          if (message.includes("ORDER_CONFLICT") || message.includes("another administrator")) await loadOrders();
          return;
        }
        showToast("Order updated. Customer account history and in-app notification are current.");
        const notificationPromise = window.LuxeOrders
          .sendWhatsAppNotifications("order_updated", card.dataset.orderId)
          .catch((notifyError) => {
            console.warn("[ALKEBULAN] Order notification delivery unavailable:", notifyError);
            return { data: null, error: notifyError };
          });
        const [, , notification] = await Promise.all([
          loadOrders(),
          loadAdminActivity(),
          notificationPromise,
        ]);
        if (!notification.error) {
          const whatsappSent = !!notification.data?.customer?.sent;
          const pushSent = Number(notification.data?.customerPush?.sent || 0) > 0;
          if (whatsappSent && pushSent) showToast("WhatsApp and browser push updates sent.");
          else if (pushSent) showToast("Browser push order update sent.");
          else if (whatsappSent) showToast("WhatsApp order update sent.");
        }
      });
    });
  }

  document.getElementById("refreshOrdersBtn")?.addEventListener("click", async () => {
    const { error } = await window.LuxeOrders.markAllAdminSeen();
    if (!error) updateAdminOrderBadge(0);
    await loadOrders();
  });

  adminOrderSearchForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    activeOrderSearch = String(adminOrderSearchInput?.value || "").trim().slice(0, 120);
    const url = new URL(window.location.href);
    url.searchParams.set("panel", "orders");
    if (activeOrderSearch) url.searchParams.set("order", activeOrderSearch);
    else url.searchParams.delete("order");
    window.history.replaceState({}, "", url);
    await loadOrders();
  });

  clearAdminOrderSearch?.addEventListener("click", async () => {
    activeOrderSearch = "";
    if (adminOrderSearchInput) adminOrderSearchInput.value = "";
    const url = new URL(window.location.href);
    url.searchParams.delete("order");
    window.history.replaceState({}, "", url);
    await loadOrders();
    adminOrderSearchInput?.focus();
  });

  adminOrderSearchInput?.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && adminOrderSearchInput.value) clearAdminOrderSearch?.click();
  });

  function visitorPageLabel(pathValue) {
    const pathname = String(pathValue || "/").split(/[?#]/)[0];
    const filename = pathname.split("/").filter(Boolean).pop() || "index.html";
    const page = filename.replace(/\.html$/i, "").toLowerCase();
    const labels = {
      index: "Home",
      shop: "Shop",
      men: "Menswear",
      women: "Womenswear",
      product: "Product details",
      wishlist: "Wishlist",
      cart: "Shopping bag",
      checkout: "Checkout",
      dashboard: "Customer account",
      login: "Sign in",
      signup: "Create account",
      about: "Our story",
      contact: "Contact",
      shipping: "Shipping",
      returns: "Returns",
      faq: "FAQ",
    };
    return labels[page] || page.replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  loadMoreAdminOrders?.addEventListener("click", () => loadOrders({ append: true }));

  function visitorRecency(timestamp) {
    const seconds = Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000));
    if (!Number.isFinite(seconds) || seconds < 15) return "Active now";
    if (seconds < 60) return `${seconds}s ago`;
    return `${Math.max(1, Math.floor(seconds / 60))}m ago`;
  }

  function visitorSessionLength(startedAt) {
    const minutes = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 60000));
    if (!Number.isFinite(minutes) || minutes < 1) return "Just arrived";
    if (minutes < 60) return `${minutes} min session`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h${remainingMinutes ? ` ${remainingMinutes}m` : ""} session`;
  }

  function renderOnlineVisitors(visitors) {
    const signedIn = visitors.filter((visitor) => visitor.is_authenticated).length;
    setText("onlineVisitorCount", visitors.length);
    setText("onlineCustomerCount", signedIn);
    setText("onlineGuestCount", visitors.length - signedIn);

    if (onlineVisitorBadge) {
      onlineVisitorBadge.textContent = visitors.length > 99 ? "99+" : String(visitors.length);
      onlineVisitorBadge.hidden = visitors.length < 1;
    }

    if (!onlineVisitorsList || !onlineVisitorsEmpty) return;
    onlineVisitorsEmpty.style.display = visitors.length ? "none" : "block";
    if (!visitors.length) {
      onlineVisitorsList.innerHTML = "";
      return;
    }

    onlineVisitorsList.innerHTML = visitors.map((visitor) => {
      const isCustomer = !!visitor.is_authenticated;
      const displayName = isCustomer
        ? (visitor.full_name || visitor.email?.split("@")[0] || "Signed-in customer")
        : "Guest visitor";
      const identity = isCustomer ? (visitor.email || "Customer account") : "Browsing anonymously";
      const initials = String(displayName).split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "G";
      return `<article class="admin-live-visitor">
        <div class="admin-live-avatar ${isCustomer ? "is-customer" : ""}" aria-hidden="true">${escapeAdminHtml(initials)}<span class="admin-live-dot"></span></div>
        <div class="admin-live-identity">
          <strong>${escapeAdminHtml(displayName)}</strong>
          <span>${escapeAdminHtml(identity)}</span>
        </div>
        <div class="admin-live-page">
          <span>Viewing</span>
          <strong>${escapeAdminHtml(visitorPageLabel(visitor.current_path))}</strong>
        </div>
        <div class="admin-live-time">
          <strong>${escapeAdminHtml(visitorRecency(visitor.last_seen_at))}</strong>
          <span>${escapeAdminHtml(visitorSessionLength(visitor.started_at))}</span>
        </div>
      </article>`;
    }).join("");
  }

  async function loadOnlineVisitors({ render = true, notifyOnError = false } = {}) {
    if (presenceLoading || !window.LuxePresence) return;
    presenceLoading = true;
    refreshPresenceBtn?.classList.add("is-loading");
    if (refreshPresenceBtn) refreshPresenceBtn.disabled = true;

    const { data: visitors, error } = await window.LuxePresence.getOnline(200);
    presenceLoading = false;
    refreshPresenceBtn?.classList.remove("is-loading");
    if (refreshPresenceBtn) refreshPresenceBtn.disabled = false;
    const shouldRender = render || document.getElementById("presencePanel")?.classList.contains("active");

    if (error) {
      customerPresenceAvailable = false;
      if (document.getElementById("customersPanel")?.classList.contains("active") && customerRows.length) {
        renderCustomers();
      }
      if (onlineVisitorBadge) onlineVisitorBadge.hidden = true;
      if (shouldRender && onlineVisitorsList && onlineVisitorsEmpty) {
        setText("onlineVisitorCount", "\u2014");
        setText("onlineCustomerCount", "\u2014");
        setText("onlineGuestCount", "\u2014");
        onlineVisitorsEmpty.style.display = "none";
        onlineVisitorsList.innerHTML = `<div class="admin-live-error"><i class="fas fa-plug"></i><div><strong>Live presence is not connected yet.</strong><span>Apply the latest Supabase migration, then refresh this panel.</span></div></div>`;
      }
      if (notifyOnError) showToast(error.message || "Could not load live visitors", true);
      return;
    }

    onlineCustomerIds = new Set((visitors || []).filter((visitor) => visitor.is_authenticated && visitor.user_id).map((visitor) => visitor.user_id));
    customerPresenceAvailable = true;
    if (document.getElementById("customersPanel")?.classList.contains("active") && customerRows.length) {
      renderCustomers();
    }
    if (shouldRender) renderOnlineVisitors(visitors || []);
    else if (onlineVisitorBadge) {
      onlineVisitorBadge.textContent = visitors.length > 99 ? "99+" : String(visitors.length);
      onlineVisitorBadge.hidden = visitors.length < 1;
    }
  }

  refreshPresenceBtn?.addEventListener("click", () => loadOnlineVisitors({ render: true, notifyOnError: true }));

  async function refreshAdminPushControl() {
    if (!adminPushToggle || !window.LuxePush) return;
    const label = adminPushToggle.querySelector("span");
    const state = await window.LuxePush.getState();
    adminPushToggle.classList.toggle("is-enabled", !!state.subscribed);
    adminPushToggle.disabled = !state.supported || state.permission === "denied";
    if (label) {
      label.textContent = !state.supported
        ? "HTTPS required"
        : state.permission === "denied"
          ? "Push blocked"
          : state.subscribed ? "Push alerts on" : "Enable push alerts";
    }
    adminPushToggle.title = !state.supported
      ? "Browser push works on HTTPS or localhost, not file:// pages."
      : state.permission === "denied" ? "Allow notifications in your browser site settings." : "";
  }

  adminPushToggle?.addEventListener("click", async () => {
    adminPushToggle.disabled = true;
    const state = await window.LuxePush.getState();
    const result = state.subscribed
      ? await window.LuxePush.unsubscribe()
      : await window.LuxePush.subscribe();
    if (result.error) showToast(result.error.message || "Could not update push alerts.", true);
    else showToast(state.subscribed ? "Admin push alerts disabled on this browser." : "Admin push alerts enabled on this browser.");
    await refreshAdminPushControl();
  });

  async function loadProducts() {
    if (productCountLabel) productCountLabel.textContent = "Loading catalog…";

    const { data, error } = await window.LuxeProducts.getAll();

    if (error) {
      adminProductCache.clear();
      if (productsTableBody) {
        productsTableBody.innerHTML = '<tr><td colspan="7">The live catalog could not be loaded. Refresh to try again.</td></tr>';
      }
      if (productsEmptyState) productsEmptyState.style.display = "none";
      if (productCountLabel) productCountLabel.textContent = "Could not load products.";
      showToast(error.message || "Failed to load products", true);
      return;
    }

    renderProductsTable(data || []);

    if (productCountLabel) {
      productCountLabel.textContent =
        `${data?.length || 0} product${data?.length === 1 ? "" : "s"} in the live catalog`;
    }
  }

  function renderProductsTable(list) {
    if (!productsTableBody || !productsEmptyState) return;
    adminProductCache = new Map(list.map((product) => [Number(product.id), product]));

    if (!list.length) {
      productsTableBody.innerHTML = "";
      productsEmptyState.style.display = "block";
      return;
    }

    productsEmptyState.style.display = "none";

    productsTableBody.innerHTML = list.map((product) => `
      <tr>
        <td><img ${window.LuxeMedia.attributes(product.image, { preset: "compact", alt: "" })}></td>
        <td class="product-name-cell">${escapeAdminHtml(product.name)}</td>
        <td>${escapeAdminHtml(product.brand || "")}</td>
        <td>${escapeAdminHtml(product.category || "")}</td>
        <td><div class="admin-price-stack"><strong>$${Number(product.price).toFixed(2)} USD</strong><span>${product.priceNGN !== null && Number.isFinite(Number(product.priceNGN)) ? `₦${Number(product.priceNGN).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} NGN` : "NGN price not set"}</span></div></td>
        <td>
          <div class="admin-stock-control">
            <span class="admin-badge ${product.inStock ? "in-stock" : "out-stock"}">
              ${product.inStock
                ? (Number.isInteger(Number(product.stockQuantity)) ? `In stock (${Math.max(0, Number(product.stockQuantity))})` : "In stock")
                : "Out of stock"}
            </span>
            <button type="button" class="admin-stock-toggle ${product.inStock ? "mark-out" : "mark-in"}" data-id="${product.id}" title="${product.inStock ? "Mark this product out of stock" : "Put this product back in stock"}">
              <i class="fas ${product.inStock ? "fa-box" : "fa-rotate-left"}" aria-hidden="true"></i>
              <span>${product.inStock ? "Mark out of stock" : "Restock"}</span>
            </button>
          </div>
        </td>
        <td>
          <div class="admin-row-actions">
            <button type="button" class="admin-icon-btn edit-product-btn" data-id="${product.id}" title="Edit" aria-label="Edit ${escapeAttr(product.name)}">
              <i class="fas fa-pen" aria-hidden="true"></i>
            </button>
            <button type="button" class="admin-icon-btn delete-btn delete-product-btn" data-id="${product.id}" title="Delete" aria-label="Delete ${escapeAttr(product.name)}">
              <i class="fas fa-trash" aria-hidden="true"></i>
            </button>
          </div>
        </td>
      </tr>
    `).join("");
    window.LuxeMedia.hydrate(productsTableBody);

    productsTableBody.querySelectorAll(".edit-product-btn").forEach((button) => {
      button.addEventListener("click", () => openProductModal(Number(button.dataset.id)));
    });

    productsTableBody.querySelectorAll(".admin-stock-toggle").forEach((button) => {
      button.addEventListener("click", () => toggleProductStock(button));
    });

    productsTableBody.querySelectorAll(".delete-product-btn").forEach((button) => {
      button.addEventListener("click", () => confirmDeleteProduct(Number(button.dataset.id)));
    });
  }

  async function toggleProductStock(button) {
    const id = Number(button.dataset.id);
    const product = adminProductCache.get(id);
    if (!product) {
      showToast("Product not found. Refresh the catalog and try again.", true);
      return;
    }

    const nextInStock = !product.inStock;
    const originalMarkup = button.innerHTML;
    button.disabled = true;
    button.classList.add("is-loading");
    button.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i><span>Updating...</span>';

    const { data, error } = await window.updateProduct(id, {
      ...product,
      inStock: nextInStock,
      stockQuantity: nextInStock ? Math.max(1, Number(product.stockQuantity) || 1) : 0,
    });

    if (error) {
      button.disabled = false;
      button.classList.remove("is-loading");
      button.innerHTML = originalMarkup;
      showToast(error.message || "Could not update stock status.", true);
      return;
    }

    if (data) adminProductCache.set(id, data);
    showToast(nextInStock ? `${product.name} is back in stock.` : `${product.name} is now out of stock.`);
    await loadProducts();
  }

  function setImagePreview(imageId, iconId, url) {
    const image = document.getElementById(imageId);
    const icon = document.getElementById(iconId);
    if (!image || !icon) return;

    if (url) {
      const media = window.LuxeMedia?.apply(image, url, {
        preset: "admin",
        alt: imageId === "pImagePreview" ? "Main product image preview" : "Hover product image preview",
      });
      if (media && !media.src) {
        image.removeAttribute("src");
        image.style.display = "none";
        icon.style.display = "block";
        return;
      }
      if (!window.LuxeMedia) image.src = url;
      image.style.display = "block";
      icon.style.display = "none";
    } else {
      image.removeAttribute("src");
      image.style.display = "none";
      icon.style.display = "block";
    }
  }

  function renderProductLivePreview() {
    const name = getValue("pName") || "New product";
    const brand = getValue("pBrand") || adminBrandName();
    const category = getValue("pCategory") || "Men";
    const subcategory = getValue("pSubcategory") || "General";
    const image = getValue("pImage");
    const price = Number.parseFloat(getValue("pPrice")) || 0;
    const oldPrice = Number.parseFloat(getValue("pOldPrice"));
    const priceNGN = Number.parseFloat(getValue("pPriceNGN")) || 0;
    const oldPriceNGN = Number.parseFloat(getValue("pOldPriceNGN"));
    setText("livePreviewName", name);
    setText("livePreviewBrand", brand);
    setText("livePreviewCategory", `${category} / ${subcategory}`);
    const priceElement = document.getElementById("livePreviewPrice");
    if (priceElement) {
      const ngn = priceNGN.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const ngnOld = Number.isFinite(oldPriceNGN) && oldPriceNGN > priceNGN
        ? ` <span class="old-price">₦${oldPriceNGN.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>`
        : "";
      const usdOld = Number.isFinite(oldPrice) && oldPrice > price
        ? ` <span class="old-price">$${oldPrice.toFixed(2)}</span>`
        : "";
      priceElement.innerHTML = `<strong>₦${ngn}${ngnOld}</strong><span>$${price.toFixed(2)} USD${usdOld}</span>`;
    }
    const imageElement = document.getElementById("livePreviewImage");
    if (imageElement) {
      const placeholder = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='500'%3E%3Crect width='100%25' height='100%25' fill='%23f2f2f2'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' fill='%23999' font-family='Arial' font-size='22'%3EProduct image%3C/text%3E%3C/svg%3E";
      if (image && window.LuxeMedia) {
        window.LuxeMedia.apply(imageElement, image, { preset: "card", alt: name });
      } else {
        imageElement.src = image || placeholder;
        imageElement.removeAttribute("srcset");
      }
    }
    const discount = document.getElementById("livePreviewDiscount");
    if (discount) {
      const visible = Number.isFinite(oldPriceNGN) && oldPriceNGN > priceNGN && priceNGN >= 0;
      discount.hidden = !visible;
      discount.textContent = visible ? `${Math.round((1 - priceNGN / oldPriceNGN) * 100)}% OFF` : "";
    }
  }

  function setProductUploadBusy(isBusy) {
    activeProductUploads = Math.max(0, activeProductUploads + (isBusy ? 1 : -1));
    const saveButton = document.getElementById("saveProductBtn");
    if (!saveButton) return;
    saveButton.disabled = activeProductUploads > 0;
    saveButton.textContent = activeProductUploads > 0 ? "Uploading image…" : "Save Product";
  }

  function replacePreviewObjectUrl(previewImageId, nextUrl = "") {
    const previousUrl = productPreviewObjectUrls.get(previewImageId);
    if (previousUrl) URL.revokeObjectURL(previousUrl);
    if (nextUrl) productPreviewObjectUrls.set(previewImageId, nextUrl);
    else productPreviewObjectUrls.delete(previewImageId);
  }

  function describeImageInspection(file, inspection) {
    if (!inspection?.width || !inspection?.height) {
      return `${formatBytes(file.size)} · original retained · preview will appear after Cloudinary converts it.`;
    }
    const resolution = `${inspection.width.toLocaleString()} × ${inspection.height.toLocaleString()} px`;
    const megapixels = `${inspection.megapixels.toFixed(1)} MP`;
    const quality = inspection.recommended
      ? "excellent for the 4:5 product frame"
      : "usable, but 1200 × 1500 px or larger is recommended";
    return `${resolution} · ${megapixels} · ${formatBytes(file.size)} · ${quality}.`;
  }

  function wireImageUpload(fileInputId, urlInputId, previewImageId, previewIconId, statusId, metaId) {
    const fileInput = document.getElementById(fileInputId);
    const urlInput = document.getElementById(urlInputId);
    const status = document.getElementById(statusId);
    const meta = document.getElementById(metaId);
    const uploadLabel = fileInput?.closest(".admin-upload-btn");

    if (!fileInput || !urlInput || !status) return;

    fileInput.addEventListener("change", async () => {
      const file = fileInput.files?.[0];
      if (!file) return;

      status.textContent = "Checking image quality and dimensions…";
      status.style.color = "";
      if (meta) {
        meta.textContent = "Reading the original file without resizing it.";
        meta.classList.remove("is-ready", "is-warning");
      }

      const inspection = await window.LuxeMedia?.validateProductFile(file);
      if (!inspection || inspection.error) {
        status.textContent = inspection?.error?.message || "This image could not be checked.";
        status.style.color = "#C0392B";
        fileInput.value = "";
        return;
      }

      if (inspection.data.previewUrl) {
        replacePreviewObjectUrl(previewImageId, inspection.data.previewUrl);
        setImagePreview(previewImageId, previewIconId, inspection.data.previewUrl);
      }
      if (meta) {
        meta.textContent = describeImageInspection(file, inspection.data);
        meta.classList.toggle("is-ready", inspection.data.recommended);
        meta.classList.toggle("is-warning", !inspection.data.recommended);
      }

      setProductUploadBusy(true);
      fileInput.disabled = true;
      uploadLabel?.classList.add("is-uploading");
      status.textContent = `Uploading the untouched master to Cloudinary (${formatBytes(file.size)})…`;

      try {
        const { url, media, error } = await window.LuxeStorage.uploadProductImage(file, inspection);
        if (error) {
          status.textContent = error.message || "Upload failed";
          status.style.color = "#C0392B";
          return;
        }

        urlInput.value = url;
        const publicId = String(media?.publicId || media?.public_id || "").trim();
        productUploadMetadata.set(urlInputId, publicId || null);
        setImagePreview(previewImageId, previewIconId, url);
        replacePreviewObjectUrl(previewImageId);
        renderProductLivePreview();
        const storedSize = media?.bytes ? formatBytes(media.bytes) : formatBytes(file.size);
        status.textContent = `Original stored securely ✓ (${storedSize})`;
        status.style.color = "#1E8E4F";
        if (meta && media?.width && media?.height) {
          meta.textContent = `${Number(media.width).toLocaleString()} × ${Number(media.height).toLocaleString()} px master · smart 4:5 storefront versions ready.`;
          meta.classList.add("is-ready");
          meta.classList.remove("is-warning");
        }
      } finally {
        fileInput.disabled = false;
        uploadLabel?.classList.remove("is-uploading");
        setProductUploadBusy(false);
      }
    });

    urlInput.addEventListener("input", () => {
      productUploadMetadata.set(urlInputId, window.LuxeMedia?.publicIdFromUrl(urlInput.value.trim()) || null);
      replacePreviewObjectUrl(previewImageId);
      setImagePreview(previewImageId, previewIconId, urlInput.value.trim());
      status.textContent = "";
      status.style.color = "";
      if (meta) {
        const isCloudinary = window.LuxeMedia?.isCloudinaryUrl(urlInput.value.trim());
        meta.textContent = urlInput.value.trim()
          ? (isCloudinary
            ? "Cloudinary master detected · responsive smart crop is active."
            : "External image detected · 4:5 display fit is active, but automatic CDN sizing is unavailable.")
          : (previewImageId === "pImagePreview"
            ? "Recommended: 1200 × 1500 px or larger."
            : "Optional second angle · the same smart 4:5 fit is applied.");
        meta.classList.toggle("is-ready", !!isCloudinary);
        meta.classList.toggle("is-warning", !!urlInput.value.trim() && !isCloudinary);
      }
      renderProductLivePreview();
    });
  }

  wireImageUpload("pImageFile", "pImage", "pImagePreview", "pImagePreviewIcon", "pImageUploadStatus", "pImageMeta");
  wireImageUpload("pHoverImageFile", "pHoverImage", "pHoverImagePreview", "pHoverImagePreviewIcon", "pHoverImageUploadStatus", "pHoverImageMeta");
  productForm?.addEventListener("input", renderProductLivePreview);
  productForm?.addEventListener("change", renderProductLivePreview);
  const stockQuantityInput = document.getElementById("pStockQuantity");
  const stockCheckbox = document.getElementById("pInStock");
  stockQuantityInput?.addEventListener("input", () => {
    const quantity = Number(stockQuantityInput.value);
    if (stockCheckbox && Number.isInteger(quantity) && quantity >= 0) {
      stockCheckbox.checked = quantity > 0;
    }
  });
  stockCheckbox?.addEventListener("change", () => {
    if (!stockQuantityInput) return;
    const quantity = Number(stockQuantityInput.value);
    stockQuantityInput.value = stockCheckbox.checked
      ? String(Math.max(1, Number.isInteger(quantity) ? quantity : 1))
      : "0";
  });

  function openProductModal(id) {
    productForm?.reset();
    setValue("productId", "");
    productUploadMetadata.clear();

    const stockCheckbox = document.getElementById("pInStock");
    if (stockCheckbox) stockCheckbox.checked = true;
    setValue("pStockQuantity", 1);

    setText("pImageUploadStatus", "");
    setText("pHoverImageUploadStatus", "");
    setText("pImageMeta", "Recommended: 1200 × 1500 px or larger.");
    setText("pHoverImageMeta", "Optional second angle · the same smart 4:5 fit is applied.");
    replacePreviewObjectUrl("pImagePreview");
    replacePreviewObjectUrl("pHoverImagePreview");

    if (id) {
      const product = adminProductCache.get(Number(id)) || window.getProductById?.(id);

      if (!product) {
        showToast("Product not found", true);
        return;
      }

      if (productModalTitle) productModalTitle.textContent = "Edit Product";

      setValue("productId", product.id);
      setValue("pName", product.name);
      setValue("pBrand", product.brand);
      setValue("pCategory", product.category || "Men");
      setValue("pSubcategory", product.subcategory);
      setValue("pRating", product.rating);
      setValue("pPrice", product.price);
      setValue("pOldPrice", product.oldPrice ?? "");
      setValue("pPriceNGN", product.priceNGN ?? "");
      setValue("pOldPriceNGN", product.oldPriceNGN ?? "");
      setValue("pImage", product.image);
      setValue("pHoverImage", product.hoverImage);
      productUploadMetadata.set("pImage", product.imagePublicId || window.LuxeMedia?.publicIdFromUrl(product.image) || null);
      productUploadMetadata.set("pHoverImage", product.hoverImagePublicId || window.LuxeMedia?.publicIdFromUrl(product.hoverImage) || null);
      setValue("pDescription", product.description);
      setValue("pSizes", (product.sizes || []).join(", "));
      setValue("pColors", (product.colors || []).join(", "));
      setValue("pTags", (product.tags || []).join(", "));
      setValue("pStockQuantity", Number.isInteger(Number(product.stockQuantity))
        ? Number(product.stockQuantity)
        : (product.inStock ? 1 : 0));

      if (stockCheckbox) stockCheckbox.checked = !!product.inStock;

      setImagePreview("pImagePreview", "pImagePreviewIcon", product.image);
      setImagePreview("pHoverImagePreview", "pHoverImagePreviewIcon", product.hoverImage);
      const mainMeta = document.getElementById("pImageMeta");
      const hoverMeta = document.getElementById("pHoverImageMeta");
      const mainIsCloudinary = window.LuxeMedia?.isCloudinaryUrl(product.image);
      const hoverIsCloudinary = window.LuxeMedia?.isCloudinaryUrl(product.hoverImage);
      if (mainMeta) {
        mainMeta.textContent = mainIsCloudinary
          ? "Cloudinary master detected · responsive smart crop is active."
          : "External image detected · display fit is active, but automatic CDN sizing is unavailable.";
        mainMeta.classList.toggle("is-ready", !!mainIsCloudinary);
        mainMeta.classList.toggle("is-warning", !mainIsCloudinary);
      }
      if (hoverMeta && product.hoverImage) {
        hoverMeta.textContent = hoverIsCloudinary
          ? "Cloudinary hover master detected · responsive smart crop is active."
          : "External hover image detected · automatic CDN sizing is unavailable.";
        hoverMeta.classList.toggle("is-ready", !!hoverIsCloudinary);
        hoverMeta.classList.toggle("is-warning", !hoverIsCloudinary);
      }
    } else {
      if (productModalTitle) productModalTitle.textContent = "Add Product";
      setImagePreview("pImagePreview", "pImagePreviewIcon", null);
      setImagePreview("pHoverImagePreview", "pHoverImagePreviewIcon", null);
    }

    productModalOverlay?.classList.add("visible");
    renderProductLivePreview();
  }

  function closeProductModal() {
    if (activeProductUploads > 0) {
      showToast("Please wait for the image upload to finish.", true);
      return;
    }
    productModalOverlay?.classList.remove("visible");
    replacePreviewObjectUrl("pImagePreview");
    replacePreviewObjectUrl("pHoverImagePreview");
  }

  document.getElementById("addProductBtn")?.addEventListener("click", () => openProductModal(null));
  document.getElementById("cancelProductBtn")?.addEventListener("click", closeProductModal);

  productModalOverlay?.addEventListener("click", (event) => {
    if (event.target === productModalOverlay) closeProductModal();
  });

  productForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (activeProductUploads > 0) {
      showToast("Please wait for the image upload to finish.", true);
      return;
    }

    const id = getValue("productId");
    const price = Number.parseFloat(getValue("pPrice"));
    const priceNGN = Number.parseFloat(getValue("pPriceNGN"));
    const stockQuantity = Number(getValue("pStockQuantity"));

    if (!Number.isFinite(price) || price < 0) {
      showToast("Enter a valid USD price", true);
      return;
    }

    if (!Number.isFinite(priceNGN) || priceNGN < 0) {
      showToast("Enter a valid NGN price", true);
      return;
    }

    if (!Number.isInteger(stockQuantity) || stockQuantity < 0 || stockQuantity > 1000000) {
      showToast("Inventory quantity must be a whole number from 0 to 1,000,000", true);
      return;
    }

    if (!isSafeHttpsUrl(getValue("pImage"))) {
      showToast("Main image must use a secure https:// URL", true);
      return;
    }
    if (getValue("pHoverImage") && !isSafeHttpsUrl(getValue("pHoverImage"))) {
      showToast("Hover image must use a secure https:// URL", true);
      return;
    }

    const payload = {
      name: getValue("pName"),
      brand: getValue("pBrand") || adminBrandName(),
      category: getValue("pCategory"),
      subcategory: getValue("pSubcategory") || "General",
      rating: getValue("pRating") || 5,
      price,
      priceNGN,
      oldPrice: getValue("pOldPrice") || null,
      oldPriceNGN: getValue("pOldPriceNGN") || null,
      image: getValue("pImage"),
      hoverImage: getValue("pHoverImage"),
      imagePublicId: productUploadMetadata.get("pImage") || null,
      hoverImagePublicId: productUploadMetadata.get("pHoverImage") || null,
      description: getValue("pDescription"),
      sizes: getValue("pSizes"),
      colors: getValue("pColors"),
      tags: getValue("pTags"),
      stockQuantity,
      inStock: stockQuantity > 0,
    };

    const confirmed = await requestAdminConfirmation({
      title: id ? `Publish changes to ${payload.name}?` : `Add ${payload.name} to the store?`,
      message: "This can change live storefront pricing, availability and product information immediately.",
    });
    if (!confirmed) return;

    const saveButton = document.getElementById("saveProductBtn");

    if (saveButton) {
      saveButton.disabled = true;
      saveButton.textContent = "Saving...";
    }

    const result = id
      ? await window.updateProduct(id, payload)
      : await window.addProduct(payload);

    if (saveButton) {
      saveButton.disabled = false;
      saveButton.textContent = "Save Product";
    }

    if (result.error) {
      showToast(result.error.message || "Save failed.", true);
      return;
    }

    showToast(id ? "Product updated" : "Product added");
    closeProductModal();
    await loadProducts();
  });

  async function confirmDeleteProduct(id) {
    const product = adminProductCache.get(Number(id)) || window.getProductById?.(id);
    const productName = product?.name || "this product";
    const confirmed = await requestAdminConfirmation({
      title: `Delete ${productName}?`,
      message: "This permanently removes the product from the live catalog. Existing order records are preserved.",
      expectedText: `DELETE ${productName}`,
      danger: true,
    });
    if (!confirmed) return;

    const { error } = await window.deleteProduct(id);

    if (error) {
      showToast(error.message || "Delete failed", true);
      return;
    }

    showToast("Product deleted");
    await loadProducts();
  }

  document.getElementById("importCatalogBtn")?.addEventListener("click", async () => {
    const button = document.getElementById("importCatalogBtn");

    const confirmed = await requestAdminConfirmation({
      title: "Import the starter catalog?",
      message: "New catalog products will be published to the live storefront. Existing matching products will not be duplicated.",
    });
    if (!confirmed) return;

    if (button) {
      button.disabled = true;
      button.textContent = "Importing...";
    }

    const { error, imported } = await window.importStarterCatalog();

    if (button) {
      button.disabled = false;
      button.innerHTML = '<i class="fas fa-cloud-upload-alt"></i> Import Starter Catalog';
    }

    if (error) {
      showToast(error.message || "Import failed", true);
      return;
    }

    showToast(
      imported
        ? `Imported ${imported} product(s)`
        : "Already up to date — nothing new to import"
    );

    await loadProducts();
  });

  const updatesList = document.getElementById("updatesList");
  const updatesEmptyState = document.getElementById("updatesEmptyState");

  async function loadUpdates() {
    const { data, error } = await window.LuxeUpdates.getAll();

    if (error) {
      showToast(error.message || "Failed to load updates", true);
      return;
    }

    if (!data.length) {
      updatesList.innerHTML = "";
      updatesEmptyState.style.display = "block";
      return;
    }

    updatesEmptyState.style.display = "none";

    updatesList.innerHTML = data.map((update) => `
      <div class="admin-update-item">
        <div>
          <h4>${escapeAdminHtml(update.title)}</h4>
          <p>${escapeAdminHtml(update.message)}</p>
          <div class="admin-update-date">
            ${new Date(update.created_at).toLocaleString()}
            ${update.active ? "" : " · inactive"}
          </div>
        </div>

        <button class="admin-icon-btn delete-btn delete-update-btn" data-id="${escapeAttr(update.id)}" title="Delete">
          <i class="fas fa-trash"></i>
        </button>
      </div>
    `).join("");

    updatesList.querySelectorAll(".delete-update-btn").forEach((button) => {
      button.addEventListener("click", async () => {
        const confirmed = await requestAdminConfirmation({
          title: "Delete this site update?",
          message: "The announcement will be removed from the storefront. The action remains in the admin audit log.",
          expectedText: "DELETE UPDATE",
          danger: true,
        });
        if (!confirmed) return;

        const { error } = await window.LuxeUpdates.remove(button.dataset.id);

        if (error) {
          showToast(error.message || "Delete failed", true);
          return;
        }

        showToast("Update deleted");
        await loadUpdates();
      });
    });
  }

  document.getElementById("postUpdateForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const title = getValue("updateTitle");
    const message = getValue("updateMessage");

    if (!title || !message) {
      showToast("Title and message are required.", true);
      return;
    }

    const confirmed = await requestAdminConfirmation({
      title: `Publish “${title}”?`,
      message: "This update will appear on the storefront and notify customer accounts in-app and by browser push when enabled.",
    });
    if (!confirmed) return;

    const { error } = await window.LuxeUpdates.create(title, message);

    if (error) {
      showToast(error.message || "Failed to post update", true);
      return;
    }

    document.getElementById("postUpdateForm")?.reset();
    const pushResult = await window.LuxePush?.broadcastUpdate(title, message);
    const pushDelivery = pushResult?.data?.delivery;
    const queuedDevices = Number(pushDelivery?.queued || 0);
    showToast(
      pushResult?.error || pushDelivery?.status === "not_configured"
        ? "Update posted. Browser push is currently unavailable."
        : pushDelivery?.status === "queued"
          ? `Update posted. Browser push queued for ${queuedDevices} subscribed device${queuedDevices === 1 ? "" : "s"}.`
        : pushDelivery?.status === "sent"
          ? `Update posted and sent to ${pushDelivery.sent} subscribed device${pushDelivery.sent === 1 ? "" : "s"}.`
          : "Update posted. No subscribed devices are active yet.",
    );
    await loadUpdates();
  });

  const customersTableBody = document.getElementById("customersTableBody");
  const customerMessageForm = document.getElementById("customerMessageForm");
  const customerMessageResult = document.getElementById("customerMessageResult");
  const adminActivityList = document.getElementById("adminActivityList");
  const globalActivityTableBody = document.getElementById("globalActivityTableBody");
  const customerDetailOverlay = document.getElementById("customerDetailOverlay");
  const customerDetailContent = document.getElementById("customerDetailContent");
  const promotionsTableBody = document.getElementById("promotionsTableBody");
  const promotionForm = document.getElementById("promotionForm");
  let customerRows = [];
  let promotionRows = [];
  let customerLoadGeneration = 0;
  let customerSearchTimer = null;

  async function loadCustomers() {
    if (!customersTableBody || !window.LuxeCustomers) return;
    const generation = ++customerLoadGeneration;
    customersTableBody.innerHTML = '<tr><td colspan="8">Loading customers...</td></tr>';
    const search = getValue("customerSearch");
    const [customerResult, presenceResult] = await Promise.all([
      window.LuxeCustomers.getAll(search, 100),
      window.LuxePresence?.getOnline(200) || Promise.resolve({ data: [], error: { message: "Presence unavailable" } }),
    ]);
    if (generation !== customerLoadGeneration) return;
    const { data, error } = customerResult;
    if (!presenceResult.error) {
      onlineCustomerIds = new Set((presenceResult.data || []).filter((visitor) => visitor.is_authenticated && visitor.user_id).map((visitor) => visitor.user_id));
      customerPresenceAvailable = true;
    } else {
      customerPresenceAvailable = false;
    }
    if (error) {
      customersTableBody.innerHTML = '<tr><td colspan="8">Customers could not be loaded.</td></tr>';
      showToast(error.message || "Failed to load customers", true);
      return;
    }
    customerRows = data || [];
    renderCustomers();
  }

  function renderCustomers() {
    if (!customersTableBody) return;
    if (!customerRows.length) {
      customersTableBody.innerHTML = '<tr><td colspan="8">No matching customer accounts.</td></tr>';
      return;
    }
    customersTableBody.innerHTML = customerRows.map((customer) => {
      const name = customer.full_name || "Unnamed customer";
      const lastOrder = customer.last_order_at
        ? new Date(customer.last_order_at).toLocaleDateString()
        : "No orders";
      const accountStatus = customer.account_status === "suspended" ? "suspended" : "active";
      const isOnline = onlineCustomerIds.has(customer.user_id);
      const presenceStatus = customerPresenceAvailable ? (isOnline ? "online" : "offline") : "unknown";
      const presenceLabel = customerPresenceAvailable ? (isOnline ? "Online now" : "Offline") : "Unavailable";
      const paymentMethods = (customer.payment_methods || []).filter(Boolean).join(", ") || "No payment method";
      return `<tr>
        <td><strong>${escapeAdminHtml(name)}</strong><br><span>${escapeAdminHtml(customer.email || "No email")}</span></td>
        <td><span class="admin-account-status ${accountStatus}">${accountStatus}</span></td>
        <td><span class="admin-customer-presence ${presenceStatus}"><span aria-hidden="true"></span>${presenceLabel}</span></td>
        <td>${escapeAdminHtml(customer.whatsapp_phone || "Not verified")}</td>
        <td>${Number(customer.order_count || 0)}<br><span>${escapeAdminHtml(lastOrder)} · ${escapeAdminHtml(paymentMethods)}</span></td>
        <td>$${Number(customer.total_spent || 0).toFixed(2)}</td>
        <td><div class="admin-contact-flags">
          <span class="admin-contact-flag ${customer.email_updates ? "enabled" : ""}">Email ${customer.email_updates ? "on" : "off"}</span>
          <span class="admin-contact-flag ${customer.whatsapp_updates ? "enabled" : ""}">WA ${customer.whatsapp_updates ? "on" : "off"}</span>
        </div></td>
        <td><div class="admin-customer-actions"><button type="button" class="admin-text-btn view-customer-btn" data-user-id="${escapeAttr(customer.user_id)}">View history</button><button type="button" class="admin-text-btn message-customer-btn" data-user-id="${escapeAttr(customer.user_id)}">Message</button></div></td>
      </tr>`;
    }).join("");

    customersTableBody.querySelectorAll(".message-customer-btn").forEach((button) => {
      button.addEventListener("click", () => selectMessageCustomer(button.dataset.userId));
    });
    customersTableBody.querySelectorAll(".view-customer-btn").forEach((button) => {
      button.addEventListener("click", () => openCustomerDetail(button.dataset.userId));
    });
  }

  function selectMessageCustomer(userId) {
    const customer = customerRows.find((entry) => entry.user_id === userId);
    if (!customer || !customerMessageForm) return;
    setValue("messageCustomerId", customer.user_id);
    setText("messageCustomerLabel", `${customer.full_name || "Customer"} · ${customer.email || "No email"}`);
    const emailChannel = document.getElementById("messageViaEmail");
    const whatsappChannel = document.getElementById("messageViaWhatsApp");
    if (emailChannel) {
      emailChannel.checked = false;
      emailChannel.disabled = !customer.email_updates;
    }
    if (whatsappChannel) {
      whatsappChannel.checked = false;
      whatsappChannel.disabled = !customer.whatsapp_updates;
    }
    if (customerMessageResult) {
      customerMessageResult.textContent = "";
      customerMessageResult.classList.remove("is-error");
    }
    customerMessageForm.hidden = false;
    document.getElementById("customerMessageTitle")?.focus();
    customerMessageForm.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function closeCustomerDetail() {
    customerDetailOverlay?.classList.remove("visible");
  }

  document.getElementById("closeCustomerDetail")?.addEventListener("click", closeCustomerDetail);
  customerDetailOverlay?.addEventListener("click", (event) => {
    if (event.target === customerDetailOverlay) closeCustomerDetail();
  });

  async function openCustomerDetail(userId) {
    if (!customerDetailOverlay || !customerDetailContent) return;
    customerDetailOverlay.classList.add("visible");
    setText("customerDetailTitle", "Customer account");
    setText("customerDetailSubtitle", "Loading protected account history...");
    customerDetailContent.innerHTML = '<p class="admin-detail-note">Loading transactions, payments and security activity...</p>';
    const { data, error } = await window.LuxeCustomers.getDetail(userId);
    if (error || !data?.customer) {
      customerDetailContent.innerHTML = '<p class="admin-detail-note">Customer history could not be loaded.</p>';
      showToast(error?.message || "Could not load customer history", true);
      return;
    }
    renderCustomerDetail(data);
  }

  function shortPaymentReference(reference) {
    const value = String(reference || "");
    if (!value) return "Not initialized";
    return value.length <= 12 ? value : `${value.slice(0, 4)}...${value.slice(-6)}`;
  }

  function renderCustomerDetail(detail) {
    const customer = detail.customer;
    const orders = detail.orders || [];
    const orderHistory = detail.orderHistory || orders.map((order) => ({
      id: order.id,
      orderNumber: order.order_number,
      status: order.status,
      currency: order.currency,
      total: order.total,
      promotionCode: order.promotion_code,
      discountAmount: order.discount_amount,
      createdAt: order.created_at,
      items: [],
    }));
    const transactionHistory = detail.transactionHistory || orders.map((order) => ({
      orderId: order.id,
      orderNumber: order.order_number,
      provider: order.payment_provider,
      channel: order.payment_channel,
      methodLabel: order.payment_method_label,
      status: order.payment_status,
      reference: order.payment_reference,
      currency: order.currency,
      amount: order.total,
      createdAt: order.created_at,
    }));
    const payments = detail.paymentMethods || [];
    const logins = detail.loginHistory || [];
    const actions = detail.adminActivity || [];
    const suspended = customer.accountStatus === "suspended";
    const isOnline = onlineCustomerIds.has(customer.userId || customer.user_id || customer.id);
    const presenceStatus = customerPresenceAvailable ? (isOnline ? "online" : "offline") : "unknown";
    const presenceLabel = customerPresenceAvailable ? (isOnline ? "Online now" : "Offline") : "Unavailable";
    setText("customerDetailTitle", customer.fullName || "Unnamed customer");
    setText("customerDetailSubtitle", `${customer.email || "No email"} · Joined ${new Date(customer.joinedAt).toLocaleDateString()}`);

    const paymentCards = payments.length ? payments.map((method) => `
      <div class="admin-payment-method">
        <strong>${escapeAdminHtml(method.label || [method.provider, method.channel].filter(Boolean).join(" · ") || "unknown")}</strong>
        <span>${Number(method.orders || 0)} order(s) · ${Number(method.successfulOrders || 0)} paid</span>
        <span>$${Number(method.total || 0).toFixed(2)} · Last used ${method.lastUsedAt ? new Date(method.lastUsedAt).toLocaleDateString() : "never"}</span>
      </div>`).join("") : '<p class="admin-detail-note">No payment methods have been used.</p>';

    const orderRows = orderHistory.length ? orderHistory.map((order) => {
      const itemSummary = (order.items || []).map((item) =>
        `${escapeAdminHtml(item.productName || "Product")} x${Number(item.quantity || 0)}`
      ).join("<br>") || "No item details";
      const eta = order.estimatedMinDays
        ? `${Number(order.estimatedMinDays)}${order.estimatedMaxDays && order.estimatedMaxDays !== order.estimatedMinDays ? `-${Number(order.estimatedMaxDays)}` : ""} days`
        : "Not set";
      return `
      <tr>
        <td><strong>${escapeAdminHtml(order.orderNumber)}</strong><span>${new Date(order.createdAt).toLocaleString()}</span></td>
        <td>${itemSummary}</td>
        <td>${escapeAdminHtml(String(order.status || "").replaceAll("_", " "))}${order.promotionCode ? `<span>Promo ${escapeAdminHtml(order.promotionCode)} - $${Number(order.discountAmount || 0).toFixed(2)}</span>` : ""}</td>
        <td>${escapeAdminHtml(eta)}${order.waybillUrl ? `<span>Waybill attached</span>` : ""}</td>
        <td><strong>${escapeAdminHtml(order.currency || "USD")} ${Number(order.total || 0).toFixed(2)}</strong></td>
      </tr>`;
    }).join("") : '<tr><td colspan="5">No orders recorded.</td></tr>';

    const transactionRows = transactionHistory.length ? transactionHistory.map((transaction) => `
      <tr>
        <td><strong>${escapeAdminHtml(transaction.orderNumber)}</strong><span>${new Date(transaction.createdAt).toLocaleString()}</span></td>
        <td>${escapeAdminHtml(transaction.provider || "whatsapp/manual")}</td>
        <td>${escapeAdminHtml(transaction.methodLabel || transaction.channel || "Not recorded")}</td>
        <td>${escapeAdminHtml(String(transaction.status || "pending").replaceAll("_", " "))}</td>
        <td>${escapeAdminHtml(shortPaymentReference(transaction.reference))}</td>
        <td><strong>${escapeAdminHtml(transaction.currency || "USD")} ${Number(transaction.amount || 0).toFixed(2)}</strong></td>
      </tr>`).join("") : '<tr><td colspan="6">No payment transactions recorded.</td></tr>';

    const loginRows = logins.length ? logins.map((event) => `
      <tr>
        <td>${escapeAdminHtml(formatAdminAction(event.action))}</td>
        <td>${escapeAdminHtml(event.ipAddress || "Unknown")}</td>
        <td class="user-agent">${escapeAdminHtml(event.userAgent || "Unknown device")}</td>
        <td>${new Date(event.createdAt).toLocaleString()}</td>
      </tr>`).join("") : `<tr><td colspan="4">${detail.authAuditAvailable ? "No stored sign-in events for this account." : "Database Auth Audit Logs are not available. Enable them in Supabase Authentication settings."}</td></tr>`;

    const actionRows = actions.length ? actions.map((entry) => `
      <tr>
        <td>${escapeAdminHtml(entry.adminEmail || "Administrator")}</td>
        <td>${escapeAdminHtml(formatAdminAction(entry.action))}</td>
        <td>${escapeAdminHtml(entry.targetType || "record")}</td>
        <td>${new Date(entry.createdAt).toLocaleString()}</td>
      </tr>`).join("") : '<tr><td colspan="4">No admin actions for this account.</td></tr>';

    customerDetailContent.innerHTML = `
      <div class="admin-detail-stats">
        <div class="admin-detail-stat"><span>Account</span><strong><span class="admin-account-status ${suspended ? "suspended" : "active"}">${suspended ? "suspended" : "active"}</span></strong></div>
        <div class="admin-detail-stat"><span>Presence</span><strong><span class="admin-customer-presence ${presenceStatus}"><span aria-hidden="true"></span>${presenceLabel}</span></strong></div>
        <div class="admin-detail-stat"><span>Orders</span><strong>${Number(customer.orderCount || 0)}</strong></div>
        <div class="admin-detail-stat"><span>Recorded spend</span><strong>$${Number(customer.totalSpent || 0).toFixed(2)}</strong></div>
        <div class="admin-detail-stat"><span>Last sign-in</span><strong>${customer.lastSignInAt ? new Date(customer.lastSignInAt).toLocaleString() : "Never"}</strong></div>
      </div>
      ${suspended ? `<div class="admin-owner-notice"><i class="fas fa-ban"></i><div><strong>Account suspended</strong><p>${escapeAdminHtml(customer.suspensionReason || "No reason recorded")} · ${customer.suspendedAt ? new Date(customer.suspendedAt).toLocaleString() : "Time unavailable"}${customer.suspendedByEmail ? ` · by ${escapeAdminHtml(customer.suspendedByEmail)}` : ""}</p></div></div>` : ""}
      <section class="admin-detail-section"><div class="admin-detail-section-heading"><h4>Payment methods</h4><span class="admin-detail-note">No card or bank details are stored here.</span></div><div class="admin-payment-methods">${paymentCards}</div></section>
      <section class="admin-detail-section"><div class="admin-detail-section-heading"><h4>Order history</h4><span class="admin-detail-note">Protected admin view</span></div><div class="admin-table-wrap"><table class="admin-table admin-detail-table"><thead><tr><th scope="col">Order</th><th scope="col">Items</th><th scope="col">Status</th><th scope="col">Delivery</th><th scope="col">Total</th></tr></thead><tbody>${orderRows}</tbody></table></div></section>
      <section class="admin-detail-section"><div class="admin-detail-section-heading"><h4>Transaction history</h4><span class="admin-detail-note">References are shortened; no card or bank credentials are stored.</span></div><div class="admin-table-wrap"><table class="admin-table admin-detail-table"><thead><tr><th scope="col">Order</th><th scope="col">Provider</th><th scope="col">Method</th><th scope="col">Status</th><th scope="col">Reference</th><th scope="col">Amount</th></tr></thead><tbody>${transactionRows}</tbody></table></div></section>
      <section class="admin-detail-section"><div class="admin-detail-section-heading"><h4>Sign-in history</h4><span class="admin-detail-note">IP addresses are sensitive security data. Use only for fraud and support review.</span></div><div class="admin-table-wrap"><table class="admin-table admin-detail-table"><thead><tr><th scope="col">Event</th><th scope="col">IP address</th><th scope="col">Device</th><th scope="col">Time</th></tr></thead><tbody>${loginRows}</tbody></table></div></section>
      <section class="admin-detail-section"><h4>Admin actions affecting this customer</h4><div class="admin-table-wrap"><table class="admin-table admin-detail-table"><thead><tr><th scope="col">Administrator</th><th scope="col">Action</th><th scope="col">Target</th><th scope="col">Time</th></tr></thead><tbody>${actionRows}</tbody></table></div></section>
      <section class="admin-detail-section admin-suspension-box ${suspended ? "is-suspended" : ""}">
        <h4>${suspended ? "Restore account access" : "Suspend account access"}</h4>
        <p>${suspended ? "Restoring access allows the customer to sign in and place new orders again." : "Suspension blocks authentication refresh and new orders while preserving orders, payments and audit evidence."}</p>
        <form class="admin-suspension-form" id="customerSuspensionForm">
          <label>Reason for this decision<input type="text" id="customerSuspensionReason" minlength="5" maxlength="300" required placeholder="Required for the audit trail"></label>
          <button type="submit" class="btn ${suspended ? "btn-primary" : "admin-danger-btn"}">${suspended ? "Restore access" : "Suspend account"}</button>
        </form>
      </section>`;

    document.getElementById("customerSuspensionForm")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const reason = getValue("customerSuspensionReason");
      const nextSuspended = !suspended;
      const expectedText = `${nextSuspended ? "BAN" : "UNBAN"} ${customer.email}`;
      const confirmed = await requestAdminConfirmation({
        title: `${nextSuspended ? "Suspend" : "Restore"} ${customer.email}?`,
        message: nextSuspended
          ? "This is a reversible ban. Transaction history will not be deleted, and administrator accounts are protected."
          : "This restores sign-in and checkout access. The reason and your admin identity will be recorded.",
        expectedText,
        danger: nextSuspended,
      });
      if (!confirmed) return;
      const button = event.currentTarget.querySelector('button[type="submit"]');
      button.disabled = true;
      button.textContent = nextSuspended ? "Suspending..." : "Restoring...";
      const result = await window.LuxeCustomers.setSuspension(
        customer.userId, nextSuspended, reason, expectedText,
      );
      button.disabled = false;
      if (result.error || result.data?.error) {
        button.textContent = nextSuspended ? "Suspend account" : "Restore access";
        const errorCode = result.data?.error;
        const errorMessages = {
          admin_account_protected: "Admin accounts are protected. Manage them in Team Management.",
          cannot_suspend_self: "You cannot suspend your own account.",
          account_action_rate_limit: "Too many account access changes. Wait before trying again.",
          auth_update_failed: "The authentication service could not change this account.",
          account_update_failed: "The account change was rolled back because its audit record could not be saved.",
        };
        showToast(errorMessages[errorCode] || errorCode || result.error?.message || "Account access could not be changed", true);
        return;
      }
      showToast(nextSuspended ? "Customer account suspended" : "Customer account restored");
      await Promise.all([loadCustomers(), loadAdminActivity()]);
      await openCustomerDetail(customer.userId);
    });
  }

  document.getElementById("customerSearchForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await loadCustomers();
  });

  document.getElementById("customerSearch")?.addEventListener("input", (event) => {
    clearTimeout(customerSearchTimer);
    const search = event.target.value.trim();
    if (search.length === 1) return;
    customerSearchTimer = setTimeout(loadCustomers, 300);
  });

  document.getElementById("clearMessageCustomer")?.addEventListener("click", () => {
    customerMessageForm?.reset();
    setValue("messageCustomerId", "");
    if (customerMessageForm) customerMessageForm.hidden = true;
  });

  customerMessageForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = document.getElementById("sendCustomerMessageBtn");
    const channels = ["in_app"];
    if (document.getElementById("messageViaEmail")?.checked) channels.push("email");
    if (document.getElementById("messageViaWhatsApp")?.checked) channels.push("whatsapp");
    const customerLabel = document.getElementById("messageCustomerLabel")?.textContent || "this customer";
    const confirmed = await requestAdminConfirmation({
      title: `Send update to ${customerLabel}?`,
      message: `Delivery channels: ${channels.join(", ")}. The message and delivery result will be attributed to your admin account.`,
    });
    if (!confirmed) return;
    button.disabled = true;
    button.textContent = "Sending...";
    const { data, error } = await window.LuxeCustomers.sendMessage(
      getValue("messageCustomerId"),
      getValue("customerMessageTitle"),
      getValue("customerMessageBody"),
      channels,
    );
    button.disabled = false;
    button.innerHTML = '<i class="fas fa-paper-plane"></i> Send update';
    if (error || data?.error) {
      if (customerMessageResult) {
        customerMessageResult.textContent = data?.error || error?.message || "Message could not be sent.";
        customerMessageResult.classList.add("is-error");
      }
      return;
    }
    const labels = [`In-app: ${data?.inApp || "sent"}`, `Push: ${data?.push || "unavailable"}`];
    if (channels.includes("email")) labels.push(`Email: ${data?.email || "unavailable"}`);
    if (channels.includes("whatsapp")) labels.push(`WhatsApp: ${data?.whatsapp || "unavailable"}`);
    if (customerMessageResult) {
      customerMessageResult.textContent = labels.join(" · ");
      customerMessageResult.classList.remove("is-error");
    }
    setValue("customerMessageTitle", "");
    setValue("customerMessageBody", "");
    showToast("Customer update processed");
    await loadAdminActivity();
  });

  async function loadAdminActivity() {
    if ((!adminActivityList && !globalActivityTableBody) || !window.LuxeCustomers) return;
    const { data, error } = await window.LuxeCustomers.getRecentActivity(100);
    if (error) {
      if (adminActivityList) adminActivityList.textContent = "Activity could not be loaded.";
      if (globalActivityTableBody) globalActivityTableBody.innerHTML = '<tr><td colspan="4">Activity could not be loaded.</td></tr>';
      return;
    }
    if (!data?.length) {
      if (adminActivityList) adminActivityList.textContent = "No admin actions recorded yet.";
      if (globalActivityTableBody) globalActivityTableBody.innerHTML = '<tr><td colspan="4">No admin actions recorded yet.</td></tr>';
      return;
    }
    if (adminActivityList) {
      adminActivityList.innerHTML = data.slice(0, 30).map((entry) => `
        <div class="admin-activity-item">
          <div><strong>${escapeAdminHtml(formatAdminAction(entry.action))}</strong>
          <span>${escapeAdminHtml(entry.admin_email || "Admin")} · ${escapeAdminHtml(entry.target_type || "record")}</span></div>
          <time datetime="${escapeAttr(entry.created_at)}">${new Date(entry.created_at).toLocaleString()}</time>
        </div>`).join("");
    }
    if (globalActivityTableBody) {
      globalActivityTableBody.innerHTML = data.map((entry) => {
        const details = entry.details || {};
        const targetLabel = details.orderNumber || details.code || details.label || details.customerName || entry.target_id || entry.target_type || "record";
        return `<tr>
          <td>${escapeAdminHtml(entry.admin_email || "Administrator")}</td>
          <td>${escapeAdminHtml(formatAdminAction(entry.action))}</td>
          <td>${escapeAdminHtml(targetLabel)}<br><span>${escapeAdminHtml(entry.target_type || "record")}</span></td>
          <td>${new Date(entry.created_at).toLocaleString()}</td>
        </tr>`;
      }).join("");
    }
  }

  document.getElementById("refreshActivityBtn")?.addEventListener("click", loadAdminActivity);

  function resetPromotionForm() {
    promotionForm?.reset();
    setValue("promotionId", "");
    setValue("promotionMinimum", "0");
    setValue("promotionPerUser", "1");
    const active = document.getElementById("promotionActive");
    if (active) active.checked = true;
    const cancel = document.getElementById("cancelPromotionEdit");
    if (cancel) cancel.hidden = true;
  }

  async function loadPromotions() {
    if (!promotionsTableBody || !window.LuxePromotions) return;
    promotionsTableBody.innerHTML = '<tr><td colspan="6">Loading promo codes...</td></tr>';
    const { data, error } = await window.LuxePromotions.getAll();
    if (error) {
      promotionsTableBody.innerHTML = '<tr><td colspan="6">Promo codes could not be loaded.</td></tr>';
      showToast(error.message || "Failed to load promo codes", true);
      return;
    }
    promotionRows = data || [];
    renderPromotions();
  }

  function promotionStatus(promotion) {
    const now = Date.now();
    if (!promotion.active) return "paused";
    if (promotion.starts_at && new Date(promotion.starts_at).getTime() > now) return "scheduled";
    if (promotion.ends_at && new Date(promotion.ends_at).getTime() <= now) return "expired";
    return "active";
  }

  function renderPromotions() {
    if (!promotionsTableBody) return;
    if (!promotionRows.length) {
      promotionsTableBody.innerHTML = '<tr><td colspan="6">No promo codes created yet.</td></tr>';
      return;
    }
    promotionsTableBody.innerHTML = promotionRows.map((promotion) => {
      const status = promotionStatus(promotion);
      const dateRule = promotion.ends_at ? `Ends ${new Date(promotion.ends_at).toLocaleDateString()}` : "No expiry";
      const uses = `${Number(promotion.redemption_count || 0)} / ${promotion.max_redemptions == null ? "∞" : Number(promotion.max_redemptions)}`;
      return `<tr>
        <td><span class="admin-promo-code">${escapeAdminHtml(promotion.code)}</span></td>
        <td>${Number(promotion.percent_off).toFixed(2).replace(/\.00$/, "")}%</td>
        <td>Min $${Number(promotion.minimum_subtotal || 0).toFixed(2)} · ${Number(promotion.per_user_limit)} per customer<br><span>${escapeAdminHtml(dateRule)}</span></td>
        <td>${escapeAdminHtml(uses)}</td>
        <td><span class="admin-promo-status ${status}">${escapeAdminHtml(status)}</span></td>
        <td>
          <button type="button" class="admin-text-btn edit-promotion-btn" data-id="${escapeAttr(promotion.id)}">Edit</button>
          <button type="button" class="admin-text-btn toggle-promotion-btn" data-id="${escapeAttr(promotion.id)}" data-active="${promotion.active}">${promotion.active ? "Pause" : "Activate"}</button>
        </td>
      </tr>`;
    }).join("");
    promotionsTableBody.querySelectorAll(".edit-promotion-btn").forEach((button) => {
      button.addEventListener("click", () => editPromotion(button.dataset.id));
    });
    promotionsTableBody.querySelectorAll(".toggle-promotion-btn").forEach((button) => {
      button.addEventListener("click", async () => {
        const nextActive = button.dataset.active !== "true";
        const promotion = promotionRows.find((entry) => entry.id === button.dataset.id);
        const confirmed = await requestAdminConfirmation({
          title: `${nextActive ? "Activate" : "Pause"} ${promotion?.code || "this promo"}?`,
          message: nextActive
            ? "Eligible customers will be able to apply this discount at checkout."
            : "New checkouts will no longer be able to apply this code.",
        });
        if (!confirmed) return;
        button.disabled = true;
        const { error } = await window.LuxePromotions.setActive(button.dataset.id, nextActive);
        button.disabled = false;
        if (error) return showToast(error.message || "Promo status could not be changed", true);
        showToast(nextActive ? "Promo activated" : "Promo paused");
        await Promise.all([loadPromotions(), loadAdminActivity()]);
      });
    });
  }

  function toLocalDateTime(value) {
    if (!value) return "";
    const date = new Date(value);
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
  }

  function editPromotion(id) {
    const promotion = promotionRows.find((entry) => entry.id === id);
    if (!promotion || !promotionForm) return;
    setValue("promotionId", promotion.id);
    setValue("promotionCode", promotion.code);
    setValue("promotionPercent", promotion.percent_off);
    setValue("promotionMinimum", promotion.minimum_subtotal);
    setValue("promotionMaxUses", promotion.max_redemptions);
    setValue("promotionPerUser", promotion.per_user_limit);
    setValue("promotionStarts", toLocalDateTime(promotion.starts_at));
    setValue("promotionEnds", toLocalDateTime(promotion.ends_at));
    document.getElementById("promotionActive").checked = !!promotion.active;
    document.getElementById("cancelPromotionEdit").hidden = false;
    promotionForm.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  document.getElementById("promotionCode")?.addEventListener("input", (event) => {
    event.target.value = event.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "");
  });

  document.getElementById("cancelPromotionEdit")?.addEventListener("click", resetPromotionForm);

  promotionForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const startsAt = getValue("promotionStarts");
    const endsAt = getValue("promotionEnds");
    if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) {
      showToast("Promo end time must be after its start time.", true);
      return;
    }
    const promotionId = getValue("promotionId");
    const promoCode = getValue("promotionCode").toUpperCase();
    const confirmed = await requestAdminConfirmation({
      title: `${promotionId ? "Update" : "Create"} promo ${promoCode}?`,
      message: `This code will deduct ${getValue("promotionPercent")}% from eligible product subtotals. Limits and dates will be enforced by the server.`,
    });
    if (!confirmed) return;
    const button = document.getElementById("savePromotionBtn");
    button.disabled = true;
    button.textContent = "Saving...";
    const { error } = await window.LuxePromotions.save({
      id: promotionId || null,
      code: promoCode,
      percentOff: Number(getValue("promotionPercent")),
      minimumSubtotal: Number(getValue("promotionMinimum") || 0),
      maxRedemptions: getValue("promotionMaxUses") ? Number(getValue("promotionMaxUses")) : null,
      perUserLimit: Number(getValue("promotionPerUser") || 1),
      startsAt: startsAt ? new Date(startsAt).toISOString() : null,
      endsAt: endsAt ? new Date(endsAt).toISOString() : null,
      active: document.getElementById("promotionActive")?.checked,
    });
    button.disabled = false;
    button.innerHTML = '<i class="fas fa-save"></i> Save promo';
    if (error) return showToast(error.message || "Promo could not be saved", true);
    showToast(promotionId ? "Promo updated" : "Promo created");
    resetPromotionForm();
    await Promise.all([loadPromotions(), loadAdminActivity()]);
  });

  const teamTableBody = document.getElementById("teamTableBody");

  async function loadTeam() {
    if (currentAdminRole !== "owner" || !teamTableBody) return;

    const { data, error } = await window.LuxeAdmins.getAll();

    if (error) {
      showToast(error.message || "Failed to load team", true);
      return;
    }

    if (!data.length) {
      teamTableBody.innerHTML = '<tr><td colspan="6">No admin accounts found.</td></tr>';
      return;
    }

    teamTableBody.innerHTML = data.map((admin) => {
      const isOwner = admin.role === "owner";
      const isSelf = admin.user_id === currentAdminUserId;
      const lastSeenTime = admin.last_seen_at ? new Date(admin.last_seen_at).getTime() : 0;
      const isOnline = lastSeenTime > Date.now() - 2 * 60 * 1000;

      return `
        <tr>
          <td>
            ${escapeAdminHtml(admin.email)}
            ${isSelf ? '<span class="admin-you-badge">You</span>' : ""}
          </td>
          <td>${escapeAdminHtml(admin.full_name || "—")}</td>
          <td>
            <span class="admin-role-badge ${isOwner ? "owner" : "admin"}">
              ${isOwner ? "Master Owner" : "Admin"}
            </span>
          </td>
          <td>
            <span class="admin-presence ${isOnline ? "online" : "offline"}">
              <span class="admin-presence-dot" aria-hidden="true"></span>
              ${isOnline ? "Online" : "Offline"}
            </span>
          </td>
          <td>${new Date(admin.added_at).toLocaleDateString()}</td>
          <td>
            ${
              isOwner
                ? '<span class="admin-protected"><i class="fas fa-lock"></i> Protected</span>'
                : `
                  <button
                    class="admin-icon-btn delete-btn remove-admin-btn"
                    data-userid="${escapeAttr(admin.user_id)}"
                    data-email="${escapeAttr(admin.email)}"
                    title="Remove admin"
                  >
                    <i class="fas fa-trash"></i>
                  </button>
                `
            }
          </td>
        </tr>
      `;
    }).join("");

    teamTableBody.querySelectorAll(".remove-admin-btn").forEach((button) => {
      button.addEventListener("click", async () => {
        if (currentAdminRole !== "owner") {
          showToast("Owner permission required.", true);
          return;
        }

        const userId = button.dataset.userid;
        const email = button.dataset.email;

        const confirmed = await requestAdminConfirmation({
          title: `Remove ${email}?`,
          message: "This account will immediately lose access to the management console. The master owner remains protected.",
          expectedText: `REMOVE ${email}`,
          danger: true,
        });
        if (!confirmed) return;

        const { error } = await window.LuxeAdmins.remove(userId);

        if (error) {
          showToast(error.message || "Could not remove admin", true);
          return;
        }

        showToast("Admin removed from team");
        await Promise.all([loadTeam(), loadAdminActivity()]);
      });
    });
  }

  document.getElementById("addAdminForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (currentAdminRole !== "owner") {
      showToast("Only the master owner can add admins.", true);
      return;
    }

    const email = getValue("newAdminEmail").toLowerCase();

    if (!email) {
      showToast("Enter an email address.", true);
      return;
    }

    const confirmed = await requestAdminConfirmation({
      title: `Grant admin access to ${email}?`,
      message: "This account will be able to manage products, orders, customers, promotions and site updates.",
      expectedText: `ADD ${email}`,
    });
    if (!confirmed) return;

    const { error } = await window.LuxeAdmins.add(email);

    if (error) {
      showToast(
        error.message ||
          `Could not add admin. Make sure they already have a ${adminBrandName()} account.`,
        true
      );
      return;
    }

    document.getElementById("addAdminForm")?.reset();
    showToast("Admin added");
    await Promise.all([loadTeam(), loadAdminActivity()]);
  });

  const hasAccess = await checkAccess();
  if (hasAccess) {
    const initialParams = new URLSearchParams(window.location.search);
    const initialPanel = initialParams.get("panel");
    const initialOrder = String(initialParams.get("order") || "").trim().slice(0, 120);
    if (initialOrder) {
      activeOrderSearch = initialOrder;
      if (adminOrderSearchInput) adminOrderSearchInput.value = initialOrder;
    }
    if (initialPanel === "orders" || initialOrder) activatePanel("ordersPanel");
    else if (initialPanel === "presence") activatePanel("presencePanel");
    else loadOnlineVisitors({ render: false });
  }

  // Lightweight polling keeps the red order indicator useful without
  // requiring a permanently open realtime socket.
  window.setInterval(() => {
    if (currentAdminRole && document.visibilityState === "visible") refreshOrderBadge();
  }, 30000);

  window.setInterval(() => {
    if (!currentAdminRole || document.visibilityState !== "visible") return;
    const shouldRender = document.getElementById("presencePanel")?.classList.contains("active");
    loadOnlineVisitors({ render: shouldRender });
  }, 20000);

  window.setInterval(async () => {
    if (!currentAdminRole || document.visibilityState !== "visible") return;
    await window.LuxeAdmins.touchPresence();
    if (currentAdminRole === "owner") await loadTeam();
  }, 60000);

  document.addEventListener("visibilitychange", async () => {
    if (!currentAdminRole || document.visibilityState !== "visible") return;
    await window.LuxeAdmins.touchPresence();
    if (currentAdminRole === "owner") await loadTeam();
    const shouldRender = document.getElementById("presencePanel")?.classList.contains("active");
    loadOnlineVisitors({ render: shouldRender });
  });
});

function getValue(id) {
  return document.getElementById(id)?.value?.trim?.() || "";
}

function setValue(id, value) {
  const element = document.getElementById(id);
  if (element) element.value = value ?? "";
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value ?? "";
}

function showToast(message, isError = false) {
  const toast = document.getElementById("adminToast");
  if (!toast) return;

  toast.textContent = message;
  toast.classList.toggle("error-toast", !!isError);
  toast.classList.add("visible");

  clearTimeout(window.__adminToastTimer);
  window.__adminToastTimer = setTimeout(() => {
    toast.classList.remove("visible");
  }, 3200);
}

function formatBytes(bytes) {
  const value = Number(bytes) || 0;

  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;

  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function escapeAdminHtml(value) { return window.LuxeUtils.escapeHtml(value); }

function escapeAttr(value) { return window.LuxeUtils.escapeAttr(value); }

function formatProductReference(productId) {
  const value = String(productId ?? "").trim();
  if (!value) return "PRODUCT REF UNAVAILABLE";
  return /^\d+$/.test(value) ? `ALK-${value.padStart(4, "0")}` : value.toUpperCase();
}

function formatAdminAction(value) {
  const labels = {
    customer_message_sent: "Message sent",
    customer_suspended: "Account suspended",
    customer_reactivated: "Account reactivated",
    order_confirmed: "Order confirmed",
    order_shipped: "Order shipped",
    order_delivered: "Order delivered",
    order_cancelled: "Order cancelled",
    order_updated: "Order updated",
    promotion_created: "Promo created",
    promotion_updated: "Promo updated",
    promotion_status_changed: "Promo status changed",
    products_insert: "Product added",
    products_update: "Product updated",
    products_delete: "Product deleted",
    site_updates_insert: "Site update posted",
    site_updates_update: "Site update changed",
    site_updates_delete: "Site update deleted",
    admin_users_insert: "Admin added",
    admin_users_update: "Admin changed",
    admin_users_delete: "Admin removed",
  };
  return labels[value] || String(value || "Admin action").replaceAll("_", " ");
}

function isSafeHttpsUrl(value) {
  try { return new URL(value).protocol === "https:"; }
  catch { return false; }
}
