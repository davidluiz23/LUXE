// js/category.js - Category Pages (Men / Women)

function escapeCategoryHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getCategoryProductMoney(product, oldPrice = false) {
  try {
    const formatted = window.LuxeMoney?.forProduct?.(product, oldPrice);
    if (formatted) return formatted;
  } catch (_) {
    // Keep rendering available if the shared formatter has not loaded yet.
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

function renderCategoryProductPrice(product) {
  const current = getCategoryProductMoney(product);
  const hasOldPrice = [product.oldPrice, product.oldPriceNGN].some(
    (value) => value !== null && value !== undefined && value !== "",
  );
  const previous = hasOldPrice ? getCategoryProductMoney(product, true) : {};
  const primary = current.ngn || current.usd || current.text || "Price unavailable";
  const secondary = current.ngn && current.usd ? current.usd : "";
  const oldPrimary = previous.ngn || previous.usd || "";

  return `
    <span class="product-current-price">${escapeCategoryHtml(primary)}</span>
    ${secondary ? `<span class="product-price-secondary">${escapeCategoryHtml(secondary)}</span>` : ""}
    ${oldPrimary ? `<span class="old-price">${escapeCategoryHtml(oldPrimary)}</span>` : ""}
  `;
}

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
  if (grid) window.showProductGridLoading?.(grid, 8);

  const loader = document.getElementById("loader");
  if (loader) {
    setTimeout(() => {
      loader.classList.add("hidden");
      loader.style.display = "none";
    }, 300);
  }

  if (window.productsReady) await window.productsReady;
  if (!grid) return;

  const isMen = document.querySelector(".men-hero") !== null;
  const category = isMen ? "Men" : "Women";
  const allProducts = typeof getProducts === "function" ? getProducts() : window.products || [];
  const categoryProducts = allProducts.filter((product) => {
    const categoryName = String(product.category || "").toLocaleLowerCase();
    const subcategory = String(product.subcategory || "").toLocaleLowerCase();
    const tags = (product.tags || []).map((tag) => String(tag).toLocaleLowerCase());
    return categoryName === category.toLocaleLowerCase()
      || subcategory === category.toLocaleLowerCase()
      || tags.includes(category.toLocaleLowerCase());
  });

  const categoryFilter = document.getElementById("categoryFilter");
  const sortFilter = document.getElementById("sortFilter");
  const filterButtons = Array.from(document.querySelectorAll(".filter-option-btn"));

  function getFilteredProducts(filterValue) {
    return categoryProducts.filter((product) => productMatchesCategoryFilter(product, filterValue));
  }

  function renderSelection() {
    const filterValue = categoryFilter?.value || "all";
    const sortValue = sortFilter?.value || "featured";
    renderCategoryProducts(sortProducts(getFilteredProducts(filterValue), sortValue), grid);
  }

  if (categoryFilter) {
    Array.from(categoryFilter.options).forEach((option) => {
      if (option.value === "all") return;
      const unavailable = getFilteredProducts(option.value).length === 0;
      option.disabled = unavailable;
      if (unavailable) option.textContent = `${option.textContent} (unavailable)`;
    });
    categoryFilter.addEventListener("change", () => {
      filterButtons.forEach((button) => {
        const active = button.dataset.filter === categoryFilter.value;
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", String(active));
      });
      renderSelection();
    });
  }

  sortFilter?.addEventListener("change", renderSelection);

  filterButtons.forEach((button) => {
    button.type = "button";
    const unavailable = getFilteredProducts(button.dataset.filter).length === 0;
    button.disabled = unavailable;
    button.setAttribute("aria-disabled", String(unavailable));
    button.setAttribute("aria-pressed", String(button.classList.contains("active")));
    if (unavailable) button.title = `${button.textContent.trim()} products are not currently available`;

    button.addEventListener("click", () => {
      if (button.disabled) return;
      if (categoryFilter) {
        categoryFilter.value = button.dataset.filter;
        categoryFilter.dispatchEvent(new Event("change"));
      } else {
        filterButtons.forEach((item) => {
          const active = item === button;
          item.classList.toggle("active", active);
          item.setAttribute("aria-pressed", String(active));
        });
        renderCategoryProducts(
          sortProducts(getFilteredProducts(button.dataset.filter), sortFilter?.value || "featured"),
          grid,
        );
      }
    });
  });

  renderSelection();
});

function renderCategoryProducts(productsList, grid) {
  if (!grid) return;
  window.finishProductGridLoading?.(grid);

  if (productsList.length === 0) {
    grid.innerHTML = `
      <div class="catalog-empty-state" role="status">
        <i class="fas fa-search" aria-hidden="true"></i>
        <h3>No products found</h3>
        <p>There are no available pieces in this selection right now.</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = productsList.map((product, index) => {
    const productId = Number.parseInt(product.id, 10);
    if (!Number.isFinite(productId)) return "";
    const safeName = escapeCategoryHtml(product.name || "Product");
    const safeCategory = escapeCategoryHtml(product.category || "");
    const safeSubcategory = escapeCategoryHtml(product.subcategory || "");
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
            <button type="button" class="add-cart" data-id="${productId}" data-has-options="${hasOptions}" aria-label="${hasOptions ? 'Choose options for' : 'Add'} ${safeName}"><i class="fas fa-shopping-bag" aria-hidden="true"></i> ${hasOptions ? 'Choose options' : 'Add'}</button>
            <button type="button" class="wishlist-btn" data-id="${productId}" aria-label="Save ${safeName} to wishlist" aria-pressed="false"><i class="fas fa-heart" aria-hidden="true"></i></button>
            <button type="button" class="quick-view" data-id="${productId}" aria-label="View ${safeName}"><i class="fas fa-eye" aria-hidden="true"></i></button>
          </div>
        </div>
        <div class="product-info">
          <h4 class="product-name"><a class="product-name-link" href="product.html?id=${productId}" style="color:inherit;text-decoration:none">${safeName}</a></h4>
          <p class="product-category">${safeCategory}${product.subcategory ? ` / ${safeSubcategory}` : ""}</p>
          <div class="product-price">${renderCategoryProductPrice(product)}</div>
        </div>
      </article>
    `;
  }).join("");

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
      window.toggleWishlist?.(Number.parseInt(button.dataset.id, 10), button);
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
