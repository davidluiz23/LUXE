// js/category.js - Category Pages (Men / Women)

function escapeCategoryHtml(value) { return window.LuxeUtils.escapeHtml(value); }

function canonicalCategoryValue(value) {
  const normalized = String(value || "").trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const aliases = {
    accessories: "accessory",
    bottoms: "bottom",
    dresses: "dress",
    jeans: "jean",
    shirts: "shirt",
    shorts: "short",
    suits: "suit",
    sweaters: "sweater",
    tops: "top",
    trousers: "trouser",
  };
  return aliases[normalized] || normalized;
}

function productMatchesCategoryFilter(product, filterValue) {
  const target = canonicalCategoryValue(filterValue);
  if (!target || target === "all") return true;
  const fields = [product.category, product.subcategory, ...(product.tags || [])]
    .map(canonicalCategoryValue)
    .filter(Boolean);
  return fields.some((field) => field === target || field.includes(target));
}

document.addEventListener("DOMContentLoaded", async () => {
  const grid = document.getElementById("menProductGrid") || document.getElementById("womenProductGrid");
  if (grid && !grid.querySelector('.modern-preview-piece')) window.LuxeCatalogUI.renderCollection(grid, '', { pending: true });
  const initialCount = document.getElementById('categoryCount');
  if (initialCount) initialCount.textContent = 'Loading products…';
  const controls = document.querySelector('.modern-catalog-controls');
  if (controls) controls.hidden = true;

  const loader = document.getElementById("loader");
  if (loader) {
    setTimeout(() => {
      loader.classList.add("hidden");
      loader.style.display = "none";
    }, 300);
  }

  if (window.productsReady) await window.productsReady;
  if (!grid) return;

  const isMen = grid.id === "menProductGrid";
  const category = isMen ? "Men" : "Women";
  const allProducts = typeof getProducts === "function" ? getProducts() : window.products || [];
  if (!allProducts.length) {
    const count = window.LuxeCatalogUI.renderCollection(grid);
    document.getElementById('categoryCount').textContent = `${count} products`;
    document.querySelector('.modern-catalog-controls').hidden = true;
    return;
  }
  if (controls) controls.hidden = false;
  const categoryProducts = allProducts.filter((product) => {
    const categoryName = String(product.category || "").toLocaleLowerCase();
    const subcategory = String(product.subcategory || "").toLocaleLowerCase();
    const tags = (product.tags || []).map((tag) => String(tag).toLocaleLowerCase());
    return categoryName === 'unisex' || tags.includes('unisex') || categoryName === category.toLocaleLowerCase()
      || subcategory === category.toLocaleLowerCase()
      || tags.includes(category.toLocaleLowerCase());
  });

  const categoryFilter = document.getElementById("categoryFilter");
  const sortFilter = document.getElementById("sortFilter");
  const types = [...new Set(categoryProducts.map(product => product.subcategory).filter(Boolean))];
  if (categoryFilter) {
    categoryFilter.innerHTML = '<option value="all">All pieces</option>' + types.map(type => `<option value="${escapeCategoryHtml(type)}">${escapeCategoryHtml(type)}</option>`).join('');
    document.getElementById('categoryTypeControl').hidden = types.length < 2;
    categoryFilter.addEventListener('change', renderSelection);
  }
  function renderSelection() {
    const selection = categoryProducts.filter(product => productMatchesCategoryFilter(product, categoryFilter?.value || 'all'));
    renderCategoryProducts(sortProducts(selection, sortFilter?.value || 'featured'), grid);
    const count = document.getElementById('categoryCount');
    if (count) count.textContent = `${selection.length} product${selection.length === 1 ? '' : 's'}`;
  }
  sortFilter?.addEventListener('change', renderSelection);

  renderSelection();
});

function renderCategoryProducts(productsList, grid) {
  if (!grid) return;
  window.LuxeCatalogUI.render(grid, productsList);
  if (!productsList.length) grid.innerHTML = `<div class="modern-catalog-empty" role="status"><h3>No pieces found</h3><p>There are no pieces in this selection yet.</p><a class="modern-text-link" href="shop.html">Explore the collection <span aria-hidden="true">&#8599;</span></a></div>`;
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
      return sorted.sort((a, b) => Number(a.price) - Number(b.price));
    case "price-high":
      return sorted.sort((a, b) => Number(b.price) - Number(a.price));
    case "rating":
      return sorted.sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0));
    case "name":
      return sorted.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base" }));
    case "newest":
      return sorted.sort((a, b) => createdTime(b) - createdTime(a));
    case "featured":
    default:
      return sorted;
  }
}
