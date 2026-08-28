// js/shop.js - Shop Page Filtering, Sorting, and Search

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
  if (priceRange) {
    priceRange.max = String(maxCatalogPrice);
    priceRange.value = String(maxCatalogPrice);
  }
  if (priceValue) priceValue.textContent = `$${maxCatalogPrice}`;
  let searchQuery = String(pageParams.get("q") || "").trim();
  let currentPage = Math.max(1, Number.parseInt(pageParams.get("page") || "1", 10) || 1);

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

  function renderQuerySummary() {
    const summary = document.getElementById("shopQuerySummary");
    const text = document.getElementById("shopQueryText");
    if (!summary || !text) return;
    summary.hidden = !searchQuery;
    text.textContent = searchQuery ? `“${searchQuery}”` : "";
  }

  function syncUrl(selectedCategory, sortValue) {
    const params = new URLSearchParams();
    if (selectedCategory !== "all") params.set("category", selectedCategory);
    if (searchQuery) params.set("q", searchQuery);
    if (sortValue !== "featured") params.set("sort", sortValue);
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
    const selectedColor = document.querySelector(".color-dot.active")?.dataset.color || "all";
    if (selectedColor !== "all") {
      results = results.filter((product) =>
        (product.colors || []).some((color) => String(color).toLocaleLowerCase() === selectedColor));
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
    syncUrl(selectedCategory, sortValue);

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
    if (priceValue) priceValue.textContent = `$${event.target.value}`;
    applyFilters();
  });
  colorDots.forEach((dot) => dot.addEventListener("click", () => {
    colorDots.forEach((item) => item.classList.remove("active"));
    dot.classList.add("active");
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
    if (priceValue) priceValue.textContent = `$${maxCatalogPrice}`;
    colorDots.forEach((dot) => dot.classList.remove("active"));
    colorDots[0]?.classList.add("active");
    if (sortSelect) sortSelect.value = "featured";
    searchQuery = "";
    applyFilters();
  });

  const filterToggle = document.getElementById("filterToggle");
  const shopSidebar = document.getElementById("shopSidebar");
  const sidebarClose = document.getElementById("sidebarClose");
  const closeFilterDrawer = () => {
    shopSidebar?.classList.remove("active");
    document.body.classList.remove("filters-open");
    filterToggle?.setAttribute("aria-expanded", "false");
  };
  filterToggle?.addEventListener("click", () => {
    shopSidebar?.classList.add("active");
    document.body.classList.add("filters-open");
    filterToggle.setAttribute("aria-expanded", "true");
    sidebarClose?.focus();
  });
  sidebarClose?.addEventListener("click", closeFilterDrawer);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && shopSidebar?.classList.contains("active")) {
      closeFilterDrawer();
      filterToggle?.focus();
    }
  });
  document.addEventListener("click", (event) => {
    if (!shopSidebar?.classList.contains("active")) return;
    if (shopSidebar.contains(event.target) || filterToggle?.contains(event.target)) return;
    closeFilterDrawer();
  });

  applyFilters({ resetPage: false });
});

function renderShopProducts(productsList, grid) {
  if (!grid) return;
  window.finishProductGridLoading?.(grid);

  if (productsList.length === 0) {
    grid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 80px 0;">
                <i class="fas fa-search" style="font-size: 3rem; color: #ddd; margin-bottom: 20px;"></i>
                <h3 style="font-size: 1.5rem; margin-bottom: 10px;">No products found</h3>
                <p style="color: #777777;">Try adjusting your filters or search terms</p>
                <button onclick="location.href='shop.html'" class="btn btn-primary" style="margin-top: 20px;">
                    <i class="fas fa-sync"></i> Reset Filters
                </button>
            </div>
        `;
    return;
  }

  grid.innerHTML = productsList
    .map(
      (product) => `
        <div class="product-card" data-id="${product.id}" onclick="window.location.href='product.html?id=${product.id}'">
            <div class="product-image">
                <img src="${product.image}" alt="${product.name}" loading="lazy">
                ${product.discount && product.oldPrice ? `<span class="discount-badge">${Math.round((1 - product.price / product.oldPrice) * 100)}% OFF</span>` : ""}
                ${product.trending ? `<span class="trending-badge"><i class="fas fa-fire"></i> Trending</span>` : ""}
                <div class="product-actions">
                    <button class="add-cart" onclick="event.stopPropagation(); if (typeof window.addToCart === 'function') window.addToCart(${product.id});">
                        <i class="fas fa-shopping-bag"></i> Quick add
                    </button>
                    <button class="wishlist-btn" onclick="event.stopPropagation(); if (typeof window.toggleWishlist === 'function') window.toggleWishlist(${product.id}, this); else if (typeof window.addToWishlist === 'function') window.addToWishlist(${product.id});">
                        <i class="fas fa-heart"></i>
                    </button>
                    <button class="quick-view" onclick="event.stopPropagation(); window.location.href='product.html?id=${product.id}'">
                        <i class="fas fa-eye"></i>
                    </button>
                </div>
            </div>
            <div class="product-info">
                ${product.brand ? `<p class="product-brand">${product.brand}</p>` : ""}
                <h4 class="product-name">${product.name}</h4>
                <p class="product-category">${product.category}${product.subcategory ? " / " + product.subcategory : ""}</p>
                <div class="product-price">
                    $${product.price.toFixed(2)}
                    ${product.oldPrice ? `<span class="old-price">$${product.oldPrice.toFixed(2)}</span>` : ""}
                </div>
                ${
                  product.rating
                    ? `
                    <div class="product-rating">
                        ${window.LuxeIcons?.rating(product.rating) || ""}
                        <span class="rating-count">(${product.rating})</span>
                    </div>
                `
                    : ""
                }
            </div>
        </div>
    `,
    )
    .join("");
}

function sortProducts(productsList, sortValue) {
  const sorted = [...productsList];

  switch (sortValue) {
    case "price-low":
      return sorted.sort((a, b) => a.price - b.price);
    case "price-high":
      return sorted.sort((a, b) => b.price - a.price);
    case "rating":
      return sorted.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    case "newest":
      return sorted;
    case "featured":
    default:
      return sorted;
  }
}
