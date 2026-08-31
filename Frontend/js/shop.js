// js/shop.js - Shop Page Filtering, Sorting, and Search

function escapeShopHtml(value) { return window.LuxeUtils.escapeHtml(value); }

function getShopProductMoney(product, oldPrice = false) {
  try {
    const formatted = window.LuxeMoney?.forProduct?.(product, oldPrice);
    if (formatted) return formatted;
  } catch (_) {
    // Keep the static catalogue usable while shared helpers initialise.
  }

  const usdRaw = oldPrice ? product.oldPrice : product.price;
  const ngnRaw = oldPrice ? product.oldPriceNGN : product.priceNGN;
  const usdValue = usdRaw === null || usdRaw === "" || usdRaw === undefined ? NaN : Number(usdRaw);
  const ngnValue = ngnRaw === null || ngnRaw === "" || ngnRaw === undefined ? NaN : Number(ngnRaw);
  const usd = Number.isFinite(usdValue)
    ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(usdValue)
    : "";
  const ngn = Number.isFinite(ngnValue)
    ? new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(ngnValue)
    : "";
  return { usd, ngn, text: ngn || usd };
}

function renderShopProductPrice(product) {
  const current = getShopProductMoney(product);
  const hasOldPrice = [product.oldPrice, product.oldPriceNGN].some(
    (value) => value !== null && value !== undefined && value !== "",
  );
  const previous = hasOldPrice ? getShopProductMoney(product, true) : {};
  const primary = current.ngn || current.usd || current.text || "Price unavailable";
  const secondary = current.ngn && current.usd ? current.usd : "";
  const oldPrimary = previous.ngn || previous.usd || "";

  return `
    <span class="product-current-price">${escapeShopHtml(primary)}</span>
    ${secondary ? `<span class="product-price-secondary">${escapeShopHtml(secondary)}</span>` : ""}
    ${oldPrimary ? `<span class="old-price">${escapeShopHtml(oldPrimary)}</span>` : ""}
  `;
}

function canonicalShopColor(value) {
  const normalized = String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (!normalized || normalized === "all") return normalized || "all";

  const tokens = new Set(normalized.split(" "));
  if (tokens.has("navy") || normalized === "midnight blue") return "navy";
  if (tokens.has("black") || tokens.has("charcoal") || tokens.has("onyx")) return "black";
  if (tokens.has("white") || tokens.has("ivory") || tokens.has("eggshell")) return "white";
  if (["beige", "tan", "camel", "sand", "stone", "cream", "ecru", "khaki"]
    .some((shade) => tokens.has(shade))) return "beige";
  if (["olive", "military", "army", "forest", "green"]
    .some((shade) => tokens.has(shade))) return "olive";
  return normalized;
}

function shopProductMatchesColor(product, selectedColor) {
  const target = canonicalShopColor(selectedColor);
  if (!target || target === "all") return true;
  return (Array.isArray(product.colors) ? product.colors : [])
    .some((color) => canonicalShopColor(color) === target);
}

document.addEventListener("DOMContentLoaded", async () => {
  const PAGE_SIZE = 12;
  const grid = document.getElementById("productGrid");
  if (grid) window.showProductGridLoading?.(grid, 8);

  const loader = document.getElementById("loader");
  if (loader) setTimeout(() => {
    loader.classList.add("hidden");
    loader.style.display = "none";
  }, 300);

  if (window.productsReady) await window.productsReady;
  if (!grid) return;

  const pageParams = new URLSearchParams(window.location.search);
  const categoryFilters = Array.from(document.querySelectorAll(".category-filter"));
  const colorDots = Array.from(document.querySelectorAll(".color-dot"));
  const priceRange = document.getElementById("priceRange");
  const priceValue = document.getElementById("priceValue");
  const sortSelect = document.getElementById("sortBy");
  const catalog = typeof getProducts === "function" ? getProducts() : window.products || [];
  const maxCatalogPrice = Math.max(
    100,
    Math.ceil(Math.max(...catalog.map((product) => Number(product.price) || 0), 0) / 100) * 100,
  );
  let searchQuery = String(pageParams.get("q") || "").trim();
  let currentPage = Math.max(1, Number.parseInt(pageParams.get("page") || "1", 10) || 1);

  const minimumPrice = Math.max(0, Number.parseInt(priceRange?.min || "0", 10) || 0);
  const requestedPrice = Number.parseInt(pageParams.get("price") || "", 10);
  const initialMaxPrice = Number.isFinite(requestedPrice)
    ? Math.min(maxCatalogPrice, Math.max(minimumPrice, requestedPrice))
    : maxCatalogPrice;
  if (priceRange) {
    priceRange.max = String(maxCatalogPrice);
    priceRange.value = String(initialMaxPrice);
    priceRange.setAttribute("aria-valuetext", `Up to $${initialMaxPrice} USD`);
  }
  if (priceValue) priceValue.textContent = `$${initialMaxPrice} USD`;

  const requestedCategory = String(pageParams.get("category") || "").toLocaleLowerCase();
  const requestedFilter = categoryFilters.find((filter) => filter.dataset.category === requestedCategory);
  if (requestedFilter) {
    categoryFilters.forEach((filter) => filter.classList.remove("active"));
    requestedFilter.classList.add("active");
  }
  const requestedSort = pageParams.get("sort");
  if (sortSelect && Array.from(sortSelect.options).some((option) => option.value === requestedSort)) {
    sortSelect.value = requestedSort;
  }
  const requestedColor = canonicalShopColor(pageParams.get("color"));
  const requestedColorDot = colorDots.find(
    (dot) => canonicalShopColor(dot.dataset.color) === requestedColor,
  );
  if (requestedColorDot) {
    colorDots.forEach((dot) => dot.classList.remove("active"));
    requestedColorDot.classList.add("active");
  }

  function renderQuerySummary() {
    const summary = document.getElementById("shopQuerySummary");
    const text = document.getElementById("shopQueryText");
    if (!summary || !text) return;
    summary.hidden = !searchQuery;
    text.textContent = searchQuery ? `“${searchQuery}”` : "";
  }

  function syncUrl(selectedCategory, sortValue, maxPrice, selectedColor) {
    const params = new URLSearchParams();
    if (selectedCategory !== "all") params.set("category", selectedCategory);
    if (searchQuery) params.set("q", searchQuery);
    if (sortValue !== "featured") params.set("sort", sortValue);
    if (maxPrice < maxCatalogPrice) params.set("price", String(maxPrice));
    if (selectedColor !== "all") params.set("color", selectedColor);
    if (currentPage > 1) params.set("page", String(currentPage));
    const query = params.toString();
    window.history.replaceState({}, "", `shop.html${query ? `?${query}` : ""}`);
  }

  function renderPagination(totalPages) {
    const pagination = document.getElementById("pagination");
    if (!pagination) return;
    pagination.replaceChildren();
    pagination.hidden = totalPages <= 1;
    if (totalPages <= 1) return;

    const addButton = (label, page, options = {}) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.disabled = !!options.disabled;
      if (options.current) {
        button.classList.add("active");
        button.setAttribute("aria-current", "page");
      }
      button.setAttribute("aria-label", options.ariaLabel || `Go to page ${page}`);
      button.addEventListener("click", () => {
        currentPage = page;
        applyFilters({ resetPage: false });
        document.querySelector(".shop-toolbar")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      pagination.appendChild(button);
    };
    const addEllipsis = () => {
      const ellipsis = document.createElement("span");
      ellipsis.className = "pagination-ellipsis";
      ellipsis.textContent = "…";
      ellipsis.setAttribute("aria-hidden", "true");
      pagination.appendChild(ellipsis);
    };

    addButton("←", currentPage - 1, { disabled: currentPage === 1, ariaLabel: "Previous page" });
    const visiblePages = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
    let previous = 0;
    Array.from(visiblePages).filter((page) => page >= 1 && page <= totalPages).sort((a, b) => a - b)
      .forEach((page) => {
        if (previous && page - previous > 1) addEllipsis();
        addButton(String(page), page, { current: page === currentPage });
        previous = page;
      });
    addButton("→", currentPage + 1, { disabled: currentPage === totalPages, ariaLabel: "Next page" });
  }

  function applyFilters({ resetPage = true } = {}) {
    if (resetPage) currentPage = 1;
    let results = [...catalog];
    const activeCategory = document.querySelector(".category-filter.active");
    const selectedCategory = activeCategory?.dataset.category || "all";
    if (selectedCategory !== "all") {
      results = results.filter((product) =>
        String(product.category || "").toLocaleLowerCase() === selectedCategory ||
        String(product.subcategory || "").toLocaleLowerCase() === selectedCategory);
    }

    const maxPrice = priceRange ? Number.parseInt(priceRange.value, 10) : maxCatalogPrice;
    results = results.filter((product) => Number(product.price) <= maxPrice);
    const selectedColor = canonicalShopColor(
      document.querySelector(".color-dot.active")?.dataset.color || "all",
    );
    if (selectedColor !== "all") {
      results = results.filter((product) => shopProductMatchesColor(product, selectedColor));
    }
    if (searchQuery) {
      const query = searchQuery.toLocaleLowerCase();
      results = results.filter((product) =>
        [product.name, product.brand, product.category, product.subcategory, ...(product.tags || [])]
          .some((field) => String(field || "").toLocaleLowerCase().includes(query)));
    }

    const sortValue = sortSelect?.value || "featured";
    results = sortProducts(results, sortValue);
    const totalPages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
    currentPage = Math.min(currentPage, totalPages);
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    const pageProducts = results.slice(startIndex, startIndex + PAGE_SIZE);
    const showingCount = document.getElementById("showingCount");
    if (showingCount) {
      showingCount.textContent = results.length
        ? `${startIndex + 1}–${Math.min(startIndex + PAGE_SIZE, results.length)} of ${results.length}`
        : "0";
    }
    renderShopProducts(pageProducts, grid);
    renderPagination(totalPages);
    renderQuerySummary();
    syncUrl(selectedCategory, sortValue, maxPrice, selectedColor);

    const resetButton = document.getElementById("resetFilters");
    if (resetButton) {
      const hasActiveFilters = selectedCategory !== "all" || maxPrice < maxCatalogPrice ||
        selectedColor !== "all" || sortValue !== "featured" || !!searchQuery;
      resetButton.disabled = !hasActiveFilters;
      resetButton.classList.toggle("is-active", hasActiveFilters);
      const label = resetButton.querySelector("span");
      if (label) label.textContent = hasActiveFilters ? "Reset filters" : "Filters clear";
    }
  }

  categoryFilters.forEach((filter) => filter.addEventListener("click", (event) => {
    event.preventDefault();
    categoryFilters.forEach((item) => item.classList.remove("active"));
    filter.classList.add("active");
    applyFilters();
  }));
  priceRange?.addEventListener("input", (event) => {
    if (priceValue) priceValue.textContent = `$${event.target.value} USD`;
    priceRange.setAttribute("aria-valuetext", `Up to $${event.target.value} USD`);
    applyFilters();
  });
  colorDots.forEach((dot) => dot.addEventListener("click", () => {
    colorDots.forEach((item) => {
      item.classList.remove("active");
      item.setAttribute("aria-pressed", "false");
    });
    dot.classList.add("active");
    dot.setAttribute("aria-pressed", "true");
    applyFilters();
  }));
  sortSelect?.addEventListener("change", () => applyFilters());
  document.getElementById("clearShopQuery")?.addEventListener("click", () => {
    searchQuery = "";
    applyFilters();
  });
  document.getElementById("resetFilters")?.addEventListener("click", () => {
    categoryFilters.forEach((filter) => filter.classList.remove("active"));
    categoryFilters[0]?.classList.add("active");
    if (priceRange) priceRange.value = String(maxCatalogPrice);
    if (priceValue) priceValue.textContent = `$${maxCatalogPrice} USD`;
    priceRange?.setAttribute("aria-valuetext", `Up to $${maxCatalogPrice} USD`);
    colorDots.forEach((dot) => {
      dot.classList.remove("active");
      dot.setAttribute("aria-pressed", "false");
    });
    colorDots[0]?.classList.add("active");
    colorDots[0]?.setAttribute("aria-pressed", "true");
    if (sortSelect) sortSelect.value = "featured";
    searchQuery = "";
    applyFilters();
  });

  const filterToggle = document.getElementById("filterToggle");
  const shopSidebar = document.getElementById("shopSidebar");
  const sidebarClose = document.getElementById("sidebarClose");
  const filterDrawerViewport = window.matchMedia("(max-width: 1020px)");
  const syncFilterAccessibility = () => {
    if (!shopSidebar) return;
    const isDrawer = filterDrawerViewport.matches;
    const isOpen = shopSidebar.classList.contains("active");
    shopSidebar.setAttribute("aria-hidden", String(isDrawer && !isOpen));
    if (isDrawer) {
      shopSidebar.setAttribute("role", "dialog");
      shopSidebar.setAttribute("aria-modal", "true");
      shopSidebar.setAttribute("aria-label", "Product filters");
    } else {
      shopSidebar.removeAttribute("role");
      shopSidebar.removeAttribute("aria-modal");
      shopSidebar.removeAttribute("aria-label");
    }
  };
  const closeFilterDrawer = ({ restoreFocus = false } = {}) => {
    shopSidebar?.classList.remove("active");
    document.body.classList.remove("filters-open");
    filterToggle?.setAttribute("aria-expanded", "false");
    syncFilterAccessibility();
    if (restoreFocus) filterToggle?.focus();
  };
  filterToggle?.addEventListener("click", () => {
    shopSidebar?.classList.add("active");
    document.body.classList.add("filters-open");
    filterToggle.setAttribute("aria-expanded", "true");
    syncFilterAccessibility();
    sidebarClose?.focus();
  });
  sidebarClose?.addEventListener("click", () => closeFilterDrawer({ restoreFocus: true }));
  document.addEventListener("keydown", (event) => {
    if (!shopSidebar?.classList.contains("active") || !filterDrawerViewport.matches) return;
    if (event.key === "Escape") {
      closeFilterDrawer({ restoreFocus: true });
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(shopSidebar.querySelectorAll('a[href], button, input, select'))
      .filter((element) => !element.hidden && !element.disabled);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  document.addEventListener("click", (event) => {
    if (!shopSidebar?.classList.contains("active")) return;
    if (shopSidebar.contains(event.target) || filterToggle?.contains(event.target)) return;
    closeFilterDrawer();
  });
  filterDrawerViewport.addEventListener("change", () => {
    if (!filterDrawerViewport.matches) closeFilterDrawer();
    syncFilterAccessibility();
  });

  colorDots.forEach((dot) => dot.setAttribute("aria-pressed", String(dot.classList.contains("active"))));
  syncFilterAccessibility();
  applyFilters({ resetPage: false });
});

function renderShopProducts(productsList, grid) {
  if (!grid) return;
  window.finishProductGridLoading?.(grid);

  if (productsList.length === 0) {
    grid.innerHTML = `
            <div class="catalog-empty-state" role="status">
                <i class="fas fa-search" aria-hidden="true"></i>
                <h3>No products found</h3>
                <p>Try adjusting your filters or search terms.</p>
                <a href="shop.html" class="btn btn-primary"><i class="fas fa-sync" aria-hidden="true"></i> Reset filters</a>
            </div>
        `;
    return;
  }

  grid.innerHTML = productsList
    .map(
      (product, index) => {
        const productId = Number.parseInt(product.id, 10);
        if (!Number.isFinite(productId)) return "";
        const safeName = escapeShopHtml(product.name || "Product");
        const safeBrand = escapeShopHtml(product.brand || "");
        const safeCategory = escapeShopHtml(product.category || "");
        const safeSubcategory = escapeShopHtml(product.subcategory || "");
        const hasOptions = (Array.isArray(product.sizes) && product.sizes.length > 0)
          || (Array.isArray(product.colors) && product.colors.length > 0);
        return `
        <article class="product-card" data-id="${productId}">
            <div class="product-image">
                <img ${window.LuxeMedia.attributes(product.image, {
                  preset: "card",
                  alt: product.name,
                  priority: index === 0,
                })}>
                ${product.discount && product.oldPrice ? `<span class="discount-badge">${Math.round((1 - product.price / product.oldPrice) * 100)}% OFF</span>` : ""}
                ${product.trending ? `<span class="trending-badge"><i class="fas fa-fire" aria-hidden="true"></i> Trending</span>` : ""}
                <div class="product-actions">
                    <button type="button" class="add-cart" data-id="${productId}" data-has-options="${hasOptions}" aria-label="${hasOptions ? 'Choose options for' : 'Add'} ${safeName}">
                        <i class="fas fa-shopping-bag" aria-hidden="true"></i> ${hasOptions ? 'Choose options' : 'Quick add'}
                    </button>
                    <button type="button" class="wishlist-btn" data-id="${productId}" aria-label="Save ${safeName} to wishlist" aria-pressed="false">
                        <i class="fas fa-heart" aria-hidden="true"></i>
                    </button>
                    <button type="button" class="quick-view" data-id="${productId}" aria-label="View ${safeName}">
                        <i class="fas fa-eye" aria-hidden="true"></i>
                    </button>
                </div>
            </div>
            <div class="product-info">
                ${product.brand ? `<p class="product-brand">${safeBrand}</p>` : ""}
                <h4 class="product-name"><a class="product-name-link" href="product.html?id=${productId}" style="color:inherit;text-decoration:none">${safeName}</a></h4>
                <p class="product-category">${safeCategory}${product.subcategory ? " / " + safeSubcategory : ""}</p>
                <div class="product-price">
                    ${renderShopProductPrice(product)}
                </div>
                ${
                  product.rating
                    ? `
                    <div class="product-rating" aria-label="Rated ${Math.max(0, Math.min(5, Number(product.rating) || 0)).toFixed(1)} out of 5">
                        ${window.LuxeIcons?.rating(product.rating) || ""}
                        <span class="rating-count">${product.reviewCount !== null && product.reviewCount !== undefined
                          ? `${Math.max(0, Number(product.reviewCount) || 0)} review${Number(product.reviewCount) === 1 ? "" : "s"}`
                          : `${Math.max(0, Math.min(5, Number(product.rating) || 0)).toFixed(1)} / 5`}</span>
                    </div>
                `
                    : ""
                }
            </div>
        </article>
    `;
      },
    )
    .join("");
  window.LuxeMedia.hydrate(grid);
  window.syncWishlistButtons?.(grid);
  grid.querySelectorAll(".product-card").forEach((card) => {
    const openProduct = () => {
      window.location.href = `product.html?id=${Number.parseInt(card.dataset.id, 10)}`;
    };
    card.addEventListener("click", (event) => {
      if (!event.target.closest("button, a")) openProduct();
    });
  });
  grid.querySelectorAll(".add-cart").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const productId = Number.parseInt(button.dataset.id, 10);
      if (button.dataset.hasOptions === "true") window.location.href = `product.html?id=${productId}`;
      else window.addToCart?.(productId);
    });
  });
  grid.querySelectorAll(".wishlist-btn").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const productId = Number.parseInt(button.dataset.id, 10);
      if (typeof window.toggleWishlist === "function") window.toggleWishlist(productId, button);
      else window.addToWishlist?.(productId);
    });
  });
  grid.querySelectorAll(".quick-view").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      window.location.href = `product.html?id=${Number.parseInt(button.dataset.id, 10)}`;
    });
  });
}

function sortProducts(productsList, sortValue) {
  const sorted = [...productsList];
  const createdTime = (product) => {
    const value = product.createdAt || product.created_at || product.updatedAt || product.updated_at;
    const parsed = value ? Date.parse(value) : NaN;
    return Number.isFinite(parsed) ? parsed : Number(product.id) || 0;
  };

  switch (sortValue) {
    case "price-low":
      return sorted.sort((a, b) => a.price - b.price);
    case "price-high":
      return sorted.sort((a, b) => b.price - a.price);
    case "rating":
      return sorted.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    case "name":
      return sorted.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base" }));
    case "newest":
      return sorted.sort((a, b) => createdTime(b) - createdTime(a));
    case "featured":
    default:
      return sorted;
  }
}
