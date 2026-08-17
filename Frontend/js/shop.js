// js/shop.js - Shop Page Filtering, Sorting, and Search

document.addEventListener('DOMContentLoaded', () => {
    // Hide loader
    const loader = document.getElementById('loader');
    if (loader) {
        setTimeout(() => {
            loader.classList.add('hidden');
            loader.style.display = 'none';
        }, 300);
    }

    // Get product grid
    const grid = document.getElementById('shopProductGrid');
    if (!grid) return;

    // Check URL parameters for category filter
    const urlParams = new URLSearchParams(window.location.search);
    const categoryParam = urlParams.get('category');
    if (categoryParam) {
        const categoryCheckboxes = document.querySelectorAll('.filter-options input[type="checkbox"]');
        categoryCheckboxes.forEach(cb => {
            if (cb.value.toLowerCase() === categoryParam.toLowerCase()) {
                cb.checked = true;
            }
        });
    }

    // Initial Filter & Render
    applyFilters();

    // Search functionality
    const searchInput = document.getElementById('shopSearch');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            applyFilters();
        });
    }

    // Sort functionality
    const sortSelect = document.getElementById('sortFilter');
    if (sortSelect) {
        sortSelect.addEventListener('change', () => {
            applyFilters();
        });
    }

    // Category filters (checkboxes)
    const categoryCheckboxes = document.querySelectorAll('.filter-options input[type="checkbox"]');
    categoryCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', () => {
            applyFilters();
        });
    });

    // Price range filter
    const priceRange = document.getElementById('priceRange');
    const priceValue = document.getElementById('priceValue');
    if (priceRange && priceValue) {
        priceRange.addEventListener('input', (e) => {
            priceValue.textContent = e.target.value;
            applyFilters();
        });
    }

    // Size buttons
    const sizeBtns = document.querySelectorAll('.size-btn');
    sizeBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            this.classList.toggle('active');
            applyFilters();
        });
    });

    // Apply all filters
    function applyFilters() {
        const currentProducts = (typeof getProducts === 'function') ? getProducts() : (window.products || []);
        let results = [...currentProducts];

        // Search filter
        const searchQuery = document.getElementById('shopSearch')?.value.trim().toLowerCase() || '';
        if (searchQuery.length > 0) {
            results = results.filter(p => 
                p.name.toLowerCase().includes(searchQuery) ||
                p.category.toLowerCase().includes(searchQuery) ||
                (p.subcategory && p.subcategory.toLowerCase().includes(searchQuery)) ||
                (p.brand && p.brand.toLowerCase().includes(searchQuery)) ||
                (p.tags && p.tags.some(t => t.toLowerCase().includes(searchQuery)))
            );
        }

        // Category filter (checkboxes)
        const selectedCategories = [];
        document.querySelectorAll('.filter-options input[type="checkbox"]:checked').forEach(cb => {
            selectedCategories.push(cb.value.toLowerCase());
        });
        if (selectedCategories.length > 0) {
            results = results.filter(p => 
                selectedCategories.some(cat => 
                    (p.category && p.category.toLowerCase().includes(cat)) || 
                    (p.subcategory && p.subcategory.toLowerCase().includes(cat)) ||
                    (p.tags && p.tags.some(t => t.toLowerCase().includes(cat)))
                )
            );
        }

        // Price filter
        const priceInput = document.getElementById('priceRange');
        const maxPrice = priceInput ? parseInt(priceInput.value) : 10000;
        results = results.filter(p => p.price <= maxPrice);

        // Size filter
        const selectedSizes = [];
        document.querySelectorAll('.size-btn.active').forEach(btn => {
            selectedSizes.push(btn.textContent.trim());
        });
        if (selectedSizes.length > 0) {
            results = results.filter(p => 
                p.sizes && p.sizes.some(size => selectedSizes.includes(size))
            );
        }

        // Sort
        const sortValue = document.getElementById('sortFilter')?.value || 'featured';
        results = sortProducts(results, sortValue);

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

    grid.innerHTML = productsList.map(product => `
        <div class="product-card" data-id="${product.id}" onclick="window.location.href='product.html?id=${product.id}'">
            <div class="product-image">
                <img src="${product.image}" alt="${product.name}" loading="lazy">
                ${product.discount && product.oldPrice ? `<span class="discount-badge">${Math.round((1 - product.price / product.oldPrice) * 100)}% OFF</span>` : ''}
                ${product.brand ? `<span style="position:absolute;top:10px;left:10px;background:rgba(0,0,0,0.7);color:white;padding:4px 10px;border-radius:4px;font-size:0.7rem;font-weight:600;">${product.brand}</span>` : ''}
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
                <p class="product-category">${product.category}${product.subcategory ? ' / ' + product.subcategory : ''}</p>
                <div class="product-price">
                    $${product.price.toFixed(2)}
                    ${product.oldPrice ? `<span class="old-price">$${product.oldPrice.toFixed(2)}</span>` : ''}
                </div>
                ${product.rating ? `
                    <div style="margin-top: 5px; font-size: 0.8rem; color: #D4AF37;">
                        ${'★'.repeat(Math.floor(product.rating))}${product.rating % 1 >= 0.5 ? '★' : ''}
                        <span style="color: #777; margin-left: 5px;">(${product.rating})</span>
                    </div>
                ` : ''}
            </div>
        </div>
    `).join('');
}

function sortProducts(productsList, sortValue) {
    const sorted = [...productsList];
    
    switch(sortValue) {
        case 'price-low':
            return sorted.sort((a, b) => a.price - b.price);
        case 'price-high':
            return sorted.sort((a, b) => b.price - a.price);
        case 'rating':
            return sorted.sort((a, b) => (b.rating || 0) - (a.rating || 0));
        case 'newest':
            return sorted;
        case 'featured':
        default:
            return sorted;
    }
}