// js/shop.js - Shop Page Filtering, Sorting, and Search

function escapeShopHtml(value) { return window.LuxeUtils.escapeHtml(value); }

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
  if (grid && !grid.querySelector('.modern-preview-piece')) window.LuxeCatalogUI.renderCollection(grid, '', { pending: true });
  const toolbar = document.querySelector('.modern-catalog-tools');
  const refine = document.getElementById('catalogFilters');
  if (toolbar) toolbar.hidden = true;
  if (refine) refine.hidden = true;

  const loader = document.getElementById("loader");
  if (loader) setTimeout(() => {
    loader.classList.add("hidden");
    loader.style.display = "none";
  }, 300);

  if (window.productsReady) await window.productsReady;
  if (!grid) return;

  const catalog = typeof getProducts === "function" ? getProducts() : window.products || [];
  if (!catalog.length && !new URLSearchParams(window.location.search).get('q')) {
    const count = window.LuxeCatalogUI.renderCollection(grid);
    document.getElementById('showingCount').parentElement.textContent = `${count} products`;
    if (toolbar) toolbar.hidden = false;
    document.querySelector('.modern-catalog-tools .modern-select-label').hidden = true;
    document.getElementById('catalogFilters').hidden = true;
    document.getElementById('pagination').hidden = true;
    return;
  }
  if (toolbar) toolbar.hidden = false;
  if (refine) refine.hidden = false;
  const colors = [...new Set(catalog.flatMap(product => product.colors || []).map(canonicalShopColor).filter(Boolean))];
  const colorHost = document.getElementById('catalogColors');
  if (colorHost) colorHost.innerHTML = ['all', ...colors.filter(color => color !== 'all')].map(color => `<button type="button" data-catalog-color data-color="${escapeShopHtml(color)}" class="${color === 'all' ? 'active' : ''}" aria-pressed="${color === 'all'}">${escapeShopHtml(color === 'all' ? 'All colours' : color.charAt(0).toUpperCase() + color.slice(1))}</button>`).join('');
  const pageParams = new URLSearchParams(window.location.search);
  const categoryFilters = Array.from(document.querySelectorAll("[data-catalog-category]"));
  const colorDots = Array.from(document.querySelectorAll("[data-catalog-color]"));
  const priceRange = document.getElementById("priceRange");
  const priceValue = document.getElementById("priceValue");
  const sortSelect = document.getElementById("sortBy");

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

  const syncCategoryFilterState = (activeFilter) => {
    categoryFilters.forEach((filter) => {
      const isActive = filter === activeFilter;
      filter.classList.toggle("active", isActive);
      if (isActive) filter.setAttribute("aria-current", "true");
      else filter.removeAttribute("aria-current");
    });
  };
  const requestedCategory = String(pageParams.get("category") || "").toLocaleLowerCase();
  const requestedFilter = categoryFilters.find((filter) => filter.dataset.category === requestedCategory);
  syncCategoryFilterState(
    requestedFilter || categoryFilters.find((filter) => filter.classList.contains("active")) || categoryFilters[0],
  );
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
        document.querySelector(".modern-catalog-tools")?.scrollIntoView({ behavior: "smooth", block: "start" });
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
    const activeCategory = document.querySelector("[data-catalog-category].active");
    const selectedCategory = activeCategory?.dataset.category || "all";
    if (selectedCategory !== "all") {
      results = results.filter((product) =>
        String(product.category || "").toLocaleLowerCase() === selectedCategory ||
        String(product.subcategory || "").toLocaleLowerCase() === selectedCategory);
    }

    const maxPrice = priceRange ? Number.parseInt(priceRange.value, 10) : maxCatalogPrice;
    results = results.filter((product) => Number(product.price) <= maxPrice);
    const selectedColor = canonicalShopColor(
      document.querySelector("[data-catalog-color].active")?.dataset.color || "all",
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
    syncCategoryFilterState(filter);
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
    syncCategoryFilterState(categoryFilters[0]);
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

  colorDots.forEach((dot) => dot.setAttribute("aria-pressed", String(dot.classList.contains("active"))));
  applyFilters({ resetPage: false });
});

function renderShopProducts(productsList, grid) {
  if (!grid) return;
  window.LuxeCatalogUI.render(grid, productsList);
  if (!productsList.length) grid.innerHTML = `<div class="modern-catalog-empty" role="status"><h3>No pieces found</h3><p>Try adjusting your filters or search terms.</p><a class="modern-text-link" href="shop.html">Explore the collection <span aria-hidden="true">&#8599;</span></a></div>`;
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
