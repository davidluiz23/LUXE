// js/admin.js - LUXE management console
//
// Database-enforced roles:
//   owner -> permanent master account; can manage admins + store
//   admin -> can manage products, uploads and site updates
//
// The frontend only changes visibility. PostgreSQL RPC/RLS is the
// actual security boundary.

let currentAdminUserId = null;
let currentAdminRole = null;

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

  function activatePanel(panelId) {
    document.querySelectorAll(".admin-nav-btn[data-panel]").forEach((button) => {
      button.classList.toggle("active", button.dataset.panel === panelId);
    });

    document.querySelectorAll(".admin-panel").forEach((panel) => {
      panel.classList.toggle("active", panel.id === panelId);
    });
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

    loginGate.style.display = "none";
    deniedGate.style.display = "none";
    layout.classList.add("visible");

    const emailEl = document.getElementById("adminOwnerEmail");
    if (emailEl) emailEl.textContent = user.email || "";

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

    await loadProducts();
    await loadUpdates();

    if (role === "owner") {
      await loadTeam();
    }

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
      await window.LuxeAuth.resetPasswordForEmail(email);

    if (resetSubmitButton) {
      resetSubmitButton.disabled = false;
      resetSubmitButton.textContent = "Send Reset Link";
    }

    // Intentionally show the same response whether or not the address
    // exists. This prevents the admin login page from revealing which
    // emails have LUXE accounts.
    if (error) {
      console.warn(
        "[LUXE] Admin password reset request:",
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

  async function loadProducts() {
    if (productCountLabel) productCountLabel.textContent = "Loading catalog…";

    const { data, error } = await window.LuxeProducts.getAll();

    if (error) {
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

    if (!list.length) {
      productsTableBody.innerHTML = "";
      productsEmptyState.style.display = "block";
      return;
    }

    productsEmptyState.style.display = "none";

    productsTableBody.innerHTML = list.map((product) => `
      <tr>
        <td><img src="${escapeAttr(product.image)}" alt="" onerror="this.style.visibility='hidden'"></td>
        <td class="product-name-cell">${escapeHtml(product.name)}</td>
        <td>${escapeHtml(product.brand || "")}</td>
        <td>${escapeHtml(product.category || "")}</td>
        <td>$${Number(product.price).toFixed(2)}</td>
        <td>
          <span class="admin-badge ${product.inStock ? "in-stock" : "out-stock"}">
            ${product.inStock ? "In Stock" : "Out"}
          </span>
        </td>
        <td>
          <div class="admin-row-actions">
            <button class="admin-icon-btn edit-product-btn" data-id="${product.id}" title="Edit">
              <i class="fas fa-pen"></i>
            </button>
            <button class="admin-icon-btn delete-btn delete-product-btn" data-id="${product.id}" title="Delete">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </td>
      </tr>
    `).join("");

    productsTableBody.querySelectorAll(".edit-product-btn").forEach((button) => {
      button.addEventListener("click", () => openProductModal(Number(button.dataset.id)));
    });

    productsTableBody.querySelectorAll(".delete-product-btn").forEach((button) => {
      button.addEventListener("click", () => confirmDeleteProduct(Number(button.dataset.id)));
    });
  }

  function setImagePreview(imageId, iconId, url) {
    const image = document.getElementById(imageId);
    const icon = document.getElementById(iconId);
    if (!image || !icon) return;

    if (url) {
      image.src = url;
      image.style.display = "block";
      icon.style.display = "none";
    } else {
      image.removeAttribute("src");
      image.style.display = "none";
      icon.style.display = "block";
    }
  }

  function wireImageUpload(fileInputId, urlInputId, previewImageId, previewIconId, statusId) {
    const fileInput = document.getElementById(fileInputId);
    const urlInput = document.getElementById(urlInputId);
    const status = document.getElementById(statusId);

    if (!fileInput || !urlInput || !status) return;

    fileInput.addEventListener("change", async () => {
      const file = fileInput.files?.[0];
      if (!file) return;

      if (file.type && !file.type.startsWith("image/")) {
        status.textContent = "Please select an image file.";
        status.style.color = "#C0392B";
        return;
      }

      status.textContent = `Uploading original (${formatBytes(file.size)})…`;
      status.style.color = "";

      const { url, error } = await window.LuxeStorage.uploadProductImage(file);

      if (error) {
        status.textContent = error.message || "Upload failed";
        status.style.color = "#C0392B";
        return;
      }

      urlInput.value = url;
      setImagePreview(previewImageId, previewIconId, url);
      status.textContent = `Uploaded ✓ Original file kept (${formatBytes(file.size)})`;
      status.style.color = "#1E8E4F";
    });

    urlInput.addEventListener("input", () => {
      setImagePreview(previewImageId, previewIconId, urlInput.value.trim());
      status.textContent = "";
    });
  }

  wireImageUpload("pImageFile", "pImage", "pImagePreview", "pImagePreviewIcon", "pImageUploadStatus");
  wireImageUpload("pHoverImageFile", "pHoverImage", "pHoverImagePreview", "pHoverImagePreviewIcon", "pHoverImageUploadStatus");

  function openProductModal(id) {
    productForm?.reset();
    setValue("productId", "");

    const stockCheckbox = document.getElementById("pInStock");
    if (stockCheckbox) stockCheckbox.checked = true;

    setText("pImageUploadStatus", "");
    setText("pHoverImageUploadStatus", "");

    if (id) {
      const product = window.getProductById?.(id);

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
      setValue("pImage", product.image);
      setValue("pHoverImage", product.hoverImage);
      setValue("pDescription", product.description);
      setValue("pSizes", (product.sizes || []).join(", "));
      setValue("pColors", (product.colors || []).join(", "));
      setValue("pTags", (product.tags || []).join(", "));

      if (stockCheckbox) stockCheckbox.checked = !!product.inStock;

      setImagePreview("pImagePreview", "pImagePreviewIcon", product.image);
      setImagePreview("pHoverImagePreview", "pHoverImagePreviewIcon", product.hoverImage);
    } else {
      if (productModalTitle) productModalTitle.textContent = "Add Product";
      setImagePreview("pImagePreview", "pImagePreviewIcon", null);
      setImagePreview("pHoverImagePreview", "pHoverImagePreviewIcon", null);
    }

    productModalOverlay?.classList.add("visible");
  }

  function closeProductModal() {
    productModalOverlay?.classList.remove("visible");
  }

  document.getElementById("addProductBtn")?.addEventListener("click", () => openProductModal(null));
  document.getElementById("cancelProductBtn")?.addEventListener("click", closeProductModal);

  productModalOverlay?.addEventListener("click", (event) => {
    if (event.target === productModalOverlay) closeProductModal();
  });

  productForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const id = getValue("productId");
    const price = Number.parseFloat(getValue("pPrice"));

    if (!Number.isFinite(price) || price < 0) {
      showToast("Enter a valid price", true);
      return;
    }

    const payload = {
      name: getValue("pName"),
      brand: getValue("pBrand") || "Luxe",
      category: getValue("pCategory"),
      subcategory: getValue("pSubcategory") || "General",
      rating: getValue("pRating") || 5,
      price,
      oldPrice: getValue("pOldPrice") || null,
      image: getValue("pImage"),
      hoverImage: getValue("pHoverImage"),
      description: getValue("pDescription"),
      sizes: getValue("pSizes"),
      colors: getValue("pColors"),
      tags: getValue("pTags"),
      inStock: !!document.getElementById("pInStock")?.checked,
    };

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
    const product = window.getProductById?.(id);

    if (!confirm(`Delete "${product?.name || "this product"}"? This cannot be undone.`)) {
      return;
    }

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
          <h4>${escapeHtml(update.title)}</h4>
          <p>${escapeHtml(update.message)}</p>
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
        if (!confirm("Delete this update?")) return;

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

    const { error } = await window.LuxeUpdates.create(title, message);

    if (error) {
      showToast(error.message || "Failed to post update", true);
      return;
    }

    document.getElementById("postUpdateForm")?.reset();
    showToast("Update posted");
    await loadUpdates();
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
      teamTableBody.innerHTML = '<tr><td colspan="5">No admin accounts found.</td></tr>';
      return;
    }

    teamTableBody.innerHTML = data.map((admin) => {
      const isOwner = admin.role === "owner";
      const isSelf = admin.user_id === currentAdminUserId;

      return `
        <tr>
          <td>
            ${escapeHtml(admin.email)}
            ${isSelf ? '<span class="admin-you-badge">You</span>' : ""}
          </td>
          <td>${escapeHtml(admin.full_name || "—")}</td>
          <td>
            <span class="admin-role-badge ${isOwner ? "owner" : "admin"}">
              ${isOwner ? "Master Owner" : "Admin"}
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

        if (!confirm(`Remove ${email} from the admin team?`)) {
          return;
        }

        const { error } = await window.LuxeAdmins.remove(userId);

        if (error) {
          showToast(error.message || "Could not remove admin", true);
          return;
        }

        showToast("Admin removed from team");
        await loadTeam();
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

    const { error } = await window.LuxeAdmins.add(email);

    if (error) {
      showToast(
        error.message ||
          "Could not add admin. Make sure they already have a LUXE account.",
        true
      );
      return;
    }

    document.getElementById("addAdminForm")?.reset();
    showToast("Admin added");
    await loadTeam();
  });

  await checkAccess();
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

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function escapeAttr(value) {
  return escapeHtml(value);
}
