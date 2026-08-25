// js/shop.js - Shop Page Filtering, Sorting, and Search

document.addEventListener("DOMContentLoaded", async () => {
  const grid = document.getElementById("productGrid");
  if (grid) window.showProductGridLoading?.(grid, 8);

  // Hide loader
  const loader = document.getElementById("loader");
  if (loader) {
    setTimeout(() => {
      loader.classList.add("hidden");
      loader.style.display = "none";
    }, 300);
  }

  // Wait for the live product catalog only after the card loading state is visible.
  if (window.productsReady) await window.productsReady;

  if (!grid) return;

  // Initialize event listeners
  setupFilterListeners();

  const pageParams = new URLSearchParams(window.location.search);
  const requestedCategory = pageParams.get("category");
  if (requestedCategory) {
    const requestedFilter = Array.from(document.querySelectorAll(".category-filter"))
      .find((filter) => filter.dataset.category === requestedCategory.toLowerCase());
    if (requestedFilter) {
      document.querySelectorAll(".category-filter").forEach((filter) => filter.classList.remove("active"));
      requestedFilter.classList.add("active");
    }
  }

  // Initial Filter & Render
  applyFilters();

  function setupFilterListeners() {
    // Category filters
    const categoryFilters = document.querySelectorAll(".category-filter");
    categoryFilters.forEach((filter) => {
      filter.addEventListener("click", (e) => {
        e.preventDefault();
        // Remove active from all
        categoryFilters.forEach((f) => f.classList.remove("active"));
        // Add active to clicked
        filter.classList.add("active");
        const category = filter.dataset.category || "all";
        const nextUrl = category === "all" ? "shop.html" : `shop.html?category=${encodeURIComponent(category)}`;
        window.history.replaceState({}, "", nextUrl);
        applyFilters();
      });
    });

    // Price range filter
    const priceRange = document.getElementById("priceRange");
    const priceValue = document.getElementById("priceValue");
    if (priceRange && priceValue) {
      priceRange.addEventListener("input", (e) => {
        priceValue.textContent = "$" + e.target.value;
        applyFilters();
      });
    }

    // Color filters
    const colorDots = document.querySelectorAll(".color-dot");
    colorDots.forEach((dot) => {
      dot.addEventListener("click", () => {
        colorDots.forEach((d) => d.classList.remove("active"));
        dot.classList.add("active");
        applyFilters();
      });
    });

    // Sort functionality
    const sortSelect = document.getElementById("sortBy");
    if (sortSelect) {
      sortSelect.addEventListener("change", () => {
        applyFilters();
      });
    }

    // Reset filters
    const resetBtn = document.getElementById("resetFilters");
    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        // Reset category
        categoryFilters.forEach((f) => f.classList.remove("active"));
        categoryFilters[0].classList.add("active");

        // Reset price
        if (priceRange) {
          priceRange.value = 6000;
          if (priceValue) priceValue.textContent = "$6000";
        }

        // Reset color
        colorDots.forEach((d) => d.classList.remove("active"));
        colorDots[0].classList.add("active");

        // Reset sort
        if (sortSelect) sortSelect.value = "featured";

        window.history.replaceState({}, "", "shop.html");

        applyFilters();
      });
    }

    // Filter toggle for mobile
    const filterToggle = document.getElementById("filterToggle");
    const shopSidebar = document.getElementById("shopSidebar");
    const sidebarClose = document.getElementById("sidebarClose");

    const closeFilterDrawer = () => {
      if (!shopSidebar) return;
      shopSidebar.classList.remove("active");
      document.body.classList.remove("filters-open");
      if (filterToggle) filterToggle.setAttribute("aria-expanded", "false");
    };

    if (filterToggle && shopSidebar) {
      filterToggle.addEventListener("click", () => {
        shopSidebar.classList.add("active");
        document.body.classList.add("filters-open");
        filterToggle.setAttribute("aria-expanded", "true");
        sidebarClose?.focus();
      });
    }

    if (sidebarClose && shopSidebar) {
      sidebarClose.addEventListener("click", closeFilterDrawer);
    }

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
  }

  const requestedSort = pageParams.get("sort");
  const sortSelect = document.getElementById("sortBy");
  if (sortSelect && Array.from(sortSelect.options).some((option) => option.value === requestedSort)) {
    sortSelect.value = requestedSort;
  }

  // Apply all filters
  function applyFilters() {
    const currentProducts =
      typeof getProducts === "function" ? getProducts() : window.products || [];
    let results = [...currentProducts];

    // Category filter
    const activeCategory = document.querySelector(".category-filter.active");
    if (activeCategory && activeCategory.dataset.category !== "all") {
      const selectedCategory = activeCategory.dataset.category;
      results = results.filter(
        (p) =>
          (p.category && p.category.toLowerCase() === selectedCategory) ||
          (p.subcategory && p.subcategory.toLowerCase() === selectedCategory),
      );
    }

    // Price filter
    const priceInput = document.getElementById("priceRange");
    const maxPrice = priceInput ? parseInt(priceInput.value) : 6000;
    results = results.filter((p) => p.price <= maxPrice);

    // Color filter
    const activeColor = document.querySelector(".color-dot.active");
    if (activeColor && activeColor.dataset.color !== "all") {
      const selectedColor = activeColor.dataset.color;
      results = results.filter(
        (p) =>
          p.colors &&
          p.colors.some((color) => color.toLowerCase() === selectedColor),
      );
    }

    // Sort
    const sortValue = document.getElementById("sortBy")?.value || "featured";
    results = sortProducts(results, sortValue);

    // Update count
    const showingCount = document.getElementById("showingCount");
    if (showingCount) {
      showingCount.textContent = results.length;
    }

    // Render
    renderShopProducts(results, grid);

    const resetButton = document.getElementById("resetFilters");
    if (resetButton) {
      const selectedCategory = document.querySelector(".category-filter.active")?.dataset.category || "all";
      const selectedColor = document.querySelector(".color-dot.active")?.dataset.color || "all";
      const hasActiveFilters =
        selectedCategory !== "all" ||
        maxPrice < 6000 ||
        selectedColor !== "all" ||
        sortValue !== "featured";
      const resetLabel = resetButton.querySelector("span");

      resetButton.disabled = !hasActiveFilters;
      resetButton.classList.toggle("is-active", hasActiveFilters);
      if (resetLabel) resetLabel.textContent = hasActiveFilters ? "Reset filters" : "Filters clear";
    }
  }
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
