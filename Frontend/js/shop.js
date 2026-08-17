// js/shop.js - Shop Page Filtering, Sorting, and Search

document.addEventListener("DOMContentLoaded", () => {
  // Hide loader
  const loader = document.getElementById("loader");
  if (loader) {
    setTimeout(() => {
      loader.classList.add("hidden");
      loader.style.display = "none";
    }, 300);
  }

  // Get product grid
  const grid = document.getElementById("productGrid");
  if (!grid) return;

  // Initialize event listeners
  setupFilterListeners();

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
          priceRange.value = 1000;
          if (priceValue) priceValue.textContent = "$1000";
        }

        // Reset color
        colorDots.forEach((d) => d.classList.remove("active"));
        colorDots[0].classList.add("active");

        // Reset sort
        if (sortSelect) sortSelect.value = "featured";

        applyFilters();
      });
    }

    // Filter toggle for mobile
    const filterToggle = document.getElementById("filterToggle");
    const shopSidebar = document.getElementById("shopSidebar");
    const sidebarClose = document.getElementById("sidebarClose");

    if (filterToggle && shopSidebar) {
      filterToggle.addEventListener("click", () => {
        shopSidebar.classList.add("active");
      });
    }

    if (sidebarClose && shopSidebar) {
      sidebarClose.addEventListener("click", () => {
        shopSidebar.classList.remove("active");
      });
    }
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
    const maxPrice = priceInput ? parseInt(priceInput.value) : 1000;
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
  }
});

function renderShopProducts(productsList, grid) {
  if (!grid) return;

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
                ${product.brand ? `<span style="position:absolute;top:10px;left:10px;background:rgba(0,0,0,0.7);color:white;padding:4px 10px;border-radius:4px;font-size:0.7rem;font-weight:600;">${product.brand}</span>` : ""}
                <div class="product-actions">
                    <button class="add-cart" onclick="event.stopPropagation(); if (typeof window.addToCart === 'function') window.addToCart(${product.id});">
                        <i class="fas fa-shopping-bag"></i> Add
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
                <h4 class="product-name">${product.name}</h4>
                <p class="product-category">${product.category}${product.subcategory ? " / " + product.subcategory : ""}</p>
                <div class="product-price">
                    $${product.price.toFixed(2)}
                    ${product.oldPrice ? `<span class="old-price">$${product.oldPrice.toFixed(2)}</span>` : ""}
                </div>
                ${
                  product.rating
                    ? `
                    <div style="margin-top: 5px; font-size: 0.8rem; color: #D4AF37;">
                        ${"★".repeat(Math.floor(product.rating))}${product.rating % 1 >= 0.5 ? "★" : ""}
                        <span style="color: #777; margin-left: 5px;">(${product.rating})</span>
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
