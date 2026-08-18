// js/admin.js - LUXE Owner Admin Panel
//
// IMPORTANT:
// There is NO owner email or owner UUID hardcoded in this frontend file.
// The database function public.is_admin() checks the logged-in auth.uid()
// against public.admin_users.

document.addEventListener("DOMContentLoaded", async () => {
  if (!window.LuxeAuth || !window.LuxeAuth.isReady()) {
    showToast("Backend not configured — check js/supabase-client.js", true);
    return;
  }

  const loginGate = document.getElementById("adminLoginGate");
  const deniedGate = document.getElementById("adminDeniedGate");
  const layout = document.getElementById("adminLayout");

  async function checkAccess() {
    const user = await window.LuxeAuth.getCurrentUser();

    if (!user) {
      loginGate.style.display = "block";
      deniedGate.style.display = "none";
      layout.classList.remove("visible");
      return false;
    }

    const isAdmin =
      window.LuxeAdmin && (await window.LuxeAdmin.isAdmin());

    if (!isAdmin) {
      loginGate.style.display = "none";
      deniedGate.style.display = "block";
      layout.classList.remove("visible");
      return false;
    }

    loginGate.style.display = "none";
    deniedGate.style.display = "none";
    layout.classList.add("visible");

    const ownerEmail = document.getElementById("adminOwnerEmail");
    if (ownerEmail) ownerEmail.textContent = user.email || "";

    await loadProducts();
    await loadUpdates();

    return true;
  }

  // ---------------------------------------------------------------
  // LOGIN GATE
  // ---------------------------------------------------------------

  const loginForm = document.getElementById("adminLoginForm");
  const loginError = document.getElementById("adminLoginError");

  if (loginForm) {
    loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      loginError?.classList.remove("visible");

      const email =
        document.getElementById("adminEmail")?.value.trim() || "";
      const password =
        document.getElementById("adminPassword")?.value || "";
      const button = document.getElementById("adminLoginBtn");

      if (button) {
        button.disabled = true;
        button.textContent = "Signing in...";
      }

      const { error } = await window.LuxeAuth.signInWithPassword(
        email,
        password,
      );

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
  }

  // ---------------------------------------------------------------
  // SIGN OUT
  // ---------------------------------------------------------------

  document
    .getElementById("adminSignOutBtn")
    ?.addEventListener("click", async () => {
      await window.LuxeAuth.signOut();
      await checkAccess();
    });

  document
    .getElementById("adminDeniedSignOut")
    ?.addEventListener("click", async () => {
      await window.LuxeAuth.signOut();
      await checkAccess();
    });

  // ---------------------------------------------------------------
  // SIDEBAR
  // ---------------------------------------------------------------

  const navButtons = document.querySelectorAll(
    ".admin-nav-btn[data-panel]",
  );
  const panels = document.querySelectorAll(".admin-panel");

  navButtons.forEach((button) => {
    button.addEventListener("click", () => {
      navButtons.forEach((item) => item.classList.remove("active"));
      panels.forEach((panel) => panel.classList.remove("active"));

      button.classList.add("active");
      document.getElementById(button.dataset.panel)?.classList.add("active");
    });
  });

  // ---------------------------------------------------------------
  // PRODUCTS
  // ---------------------------------------------------------------

  const productsTableBody =
    document.getElementById("productsTableBody");
  const productsEmptyState =
    document.getElementById("productsEmptyState");
  const productCountLabel =
    document.getElementById("productCountLabel");
  const productModalOverlay =
    document.getElementById("productModalOverlay");
  const productForm = document.getElementById("productForm");
  const productModalTitle =
    document.getElementById("productModalTitle");

  async function loadProducts() {
    if (!window.LuxeProducts) return;

    if (productCountLabel) {
      productCountLabel.textContent = "Loading catalog…";
    }

    const { data, error } = await window.LuxeProducts.getAll();

    if (error) {
      if (productCountLabel) {
        productCountLabel.textContent = "Could not load products.";
      }
      showToast(error.message || "Failed to load products", true);
      return;
    }

    // Keep products.js shared cache aligned with the latest DB result.
    if (Array.isArray(data)) {
      window.products = data;
    }

    renderProductsTable(data || []);

    if (productCountLabel) {
      productCountLabel.textContent = `${data?.length || 0} product${
        data?.length === 1 ? "" : "s"
      } in the live catalog`;
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

    productsTableBody.innerHTML = list
      .map(
        (product) => `
          <tr>
            <td>
              <img
                src="${escapeAttr(product.image)}"
                alt=""
                onerror="this.style.visibility='hidden'"
              >
            </td>
            <td class="product-name-cell">${escapeHtml(product.name)}</td>
            <td>${escapeHtml(product.brand || "")}</td>
            <td>${escapeHtml(product.category || "")}</td>
            <td>$${Number(product.price).toFixed(2)}</td>
            <td>
              <span class="admin-badge ${
                product.inStock ? "in-stock" : "out-stock"
              }">
                ${product.inStock ? "In Stock" : "Out"}
              </span>
            </td>
            <td>
              <div class="admin-row-actions">
                <button
                  class="admin-icon-btn edit-product-btn"
                  data-id="${product.id}"
                  title="Edit"
                >
                  <i class="fas fa-pen"></i>
                </button>
                <button
                  class="admin-icon-btn delete-btn delete-product-btn"
                  data-id="${product.id}"
                  title="Delete"
                >
                  <i class="fas fa-trash"></i>
                </button>
              </div>
            </td>
          </tr>
        `,
      )
      .join("");

    productsTableBody
      .querySelectorAll(".edit-product-btn")
      .forEach((button) => {
        button.addEventListener("click", () => {
          openProductModal(Number(button.dataset.id));
        });
      });

    productsTableBody
      .querySelectorAll(".delete-product-btn")
      .forEach((button) => {
        button.addEventListener("click", () => {
          confirmDeleteProduct(Number(button.dataset.id));
        });
      });
  }

  function openProductModal(id) {
    if (!productForm || !productModalOverlay) return;

    productForm.reset();

    const productId = document.getElementById("productId");
    const stockCheckbox = document.getElementById("pInStock");

    if (productId) productId.value = "";
    if (stockCheckbox) stockCheckbox.checked = true;

    if (id) {
      const product = window.getProductById?.(id);

      if (!product) {
        showToast("Product not found", true);
        return;
      }

      if (productModalTitle) productModalTitle.textContent = "Edit Product";
      if (productId) productId.value = product.id;

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
    } else if (productModalTitle) {
      productModalTitle.textContent = "Add Product";
    }

    productModalOverlay.classList.add("visible");
  }

  function closeProductModal() {
    productModalOverlay?.classList.remove("visible");
  }

  document
    .getElementById("addProductBtn")
    ?.addEventListener("click", () => openProductModal(null));

  document
    .getElementById("cancelProductBtn")
    ?.addEventListener("click", closeProductModal);

  productModalOverlay?.addEventListener("click", (event) => {
    if (event.target === productModalOverlay) {
      closeProductModal();
    }
  });

  productForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const id = document.getElementById("productId")?.value || "";
    const price = Number.parseFloat(
      document.getElementById("pPrice")?.value || "",
    );

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
      showToast(result.error.message || "Save failed", true);
      return;
    }

    showToast(id ? "Product updated" : "Product added");
    closeProductModal();
    await loadProducts();
  });

  async function confirmDeleteProduct(id) {
    const product = window.getProductById?.(id);

    if (
      !confirm(
        `Delete "${product?.name || "this product"}"? This cannot be undone.`,
      )
    ) {
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

  document
    .getElementById("importCatalogBtn")
    ?.addEventListener("click", async () => {
      const button = document.getElementById("importCatalogBtn");

      if (button) {
        button.disabled = true;
        button.textContent = "Importing...";
      }

      const { error, imported } = await window.importStarterCatalog();

      if (button) {
        button.disabled = false;
        button.innerHTML =
          '<i class="fas fa-cloud-upload-alt"></i> Import Starter Catalog';
      }

      if (error) {
        showToast(error.message || "Import failed", true);
        return;
      }

      showToast(
        imported
          ? `Imported ${imported} product(s)`
          : "Already up to date — nothing new to import",
      );

      await loadProducts();
    });

  // ---------------------------------------------------------------
  // SITE UPDATES
  // ---------------------------------------------------------------

  const updatesList = document.getElementById("updatesList");
  const updatesEmptyState =
    document.getElementById("updatesEmptyState");

  async function loadUpdates() {
    if (!window.LuxeUpdates || !updatesList || !updatesEmptyState) return;

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

    updatesList.innerHTML = data
      .map(
        (update) => `
          <div class="admin-update-item">
            <div>
              <h4>${escapeHtml(update.title)}</h4>
              <p>${escapeHtml(update.message)}</p>
              <div class="admin-update-date">
                ${new Date(update.created_at).toLocaleString()}
                ${update.active ? "" : " · inactive"}
              </div>
            </div>

            <button
              class="admin-icon-btn delete-btn delete-update-btn"
              data-id="${escapeAttr(update.id)}"
              title="Delete"
            >
              <i class="fas fa-trash"></i>
            </button>
          </div>
        `,
      )
      .join("");

    updatesList
      .querySelectorAll(".delete-update-btn")
      .forEach((button) => {
        button.addEventListener("click", async () => {
          if (!confirm("Delete this update?")) return;

          const { error } = await window.LuxeUpdates.remove(
            button.dataset.id,
          );

          if (error) {
            showToast(error.message || "Delete failed", true);
            return;
          }

          showToast("Update deleted");
          await loadUpdates();
        });
      });
  }

  document
    .getElementById("postUpdateForm")
    ?.addEventListener("submit", async (event) => {
      event.preventDefault();

      const title = getValue("updateTitle");
      const message = getValue("updateMessage");

      if (!title || !message) {
        showToast("Title and message are required", true);
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

  // Run gate last, after functions/constants above are initialized.
  await checkAccess();
});

// ---------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------

function getValue(id) {
  return document.getElementById(id)?.value?.trim?.() || "";
}

function setValue(id, value) {
  const element = document.getElementById(id);
  if (element) element.value = value ?? "";
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

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (character) => {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[character];
  });
}

function escapeAttr(value) {
  return escapeHtml(value);
}
