// js/category.js - Category Pages (Men / Women)

document.addEventListener('DOMContentLoaded', async () => {
    const grid = document.getElementById('menProductGrid') || document.getElementById('womenProductGrid');
    if (grid) window.showProductGridLoading?.(grid, 8);

    // Hide loader
    const loader = document.getElementById('loader');
    if (loader) {
        setTimeout(() => {
            loader.classList.add('hidden');
            loader.style.display = 'none';
        }, 300);
    }

    // Wait for the live product catalog only after the card loading state is visible.
    if (window.productsReady) await window.productsReady;

    if (!grid) return;

    // Determine category from page structure
    const isMen = document.querySelector('.men-hero') !== null;
    const category = isMen ? 'Men' : 'Women';
    
    // Filter products for Men or Women page
    const allProds = (typeof getProducts === 'function') ? getProducts() : (window.products || []);
    let categoryProducts = allProds.filter(p => 
        p.category === category || 
        (p.subcategory && p.subcategory.toLowerCase() === category.toLowerCase()) ||
        (p.tags && p.tags.some(t => t.toLowerCase() === category.toLowerCase()))
    );

    // If no specific category match found (e.g. for Women), fallback to showing catalog products cleanly
    if (categoryProducts.length === 0) {
        categoryProducts = allProds.slice(0, 12);
    }
    
    // Render initial products
    renderCategoryProducts(categoryProducts, grid);

    // Filter logic helper
    function getFilteredProducts(filterVal) {
        if (!filterVal || filterVal === 'all') return categoryProducts;
        const val = filterVal.toLowerCase();
        const res = categoryProducts.filter(p => 
            (p.category && p.category.toLowerCase() === val) ||
            (p.subcategory && p.subcategory.toLowerCase().includes(val)) ||
            (p.tags && p.tags.some(t => t.toLowerCase() === val))
        );
        return res.length > 0 ? res : categoryProducts;
    }

    // Category filter dropdown
    const categoryFilter = document.getElementById('categoryFilter');
    if (categoryFilter) {
        categoryFilter.addEventListener('change', (e) => {
            const filter = e.target.value;
            let filtered = getFilteredProducts(filter);
            
            // Apply sort
            const sortValue = document.getElementById('sortFilter')?.value || 'featured';
            filtered = sortProducts(filtered, sortValue);
            
            renderCategoryProducts(filtered, grid);
        });
    }

    // Sort filter
    const sortFilter = document.getElementById('sortFilter');
    if (sortFilter) {
        sortFilter.addEventListener('change', (e) => {
            const sortValue = e.target.value;
            const categoryFilterValue = document.getElementById('categoryFilter')?.value || 'all';
            let sorted = getFilteredProducts(categoryFilterValue);
            
            sorted = sortProducts(sorted, sortValue);
            renderCategoryProducts(sorted, grid);
        });
    }

    // Quick filter buttons (pills)
    const filterButtons = document.querySelectorAll('.filter-option-btn');
    if (filterButtons.length > 0) {
        filterButtons.forEach(btn => {
            btn.addEventListener('click', function() {
                filterButtons.forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                
                const filterValue = this.dataset.filter;
                if (categoryFilter) {
                    categoryFilter.value = filterValue;
                    categoryFilter.dispatchEvent(new Event('change'));
                } else {
                    let filtered = getFilteredProducts(filterValue);
                    const sortValue = document.getElementById('sortFilter')?.value || 'featured';
                    filtered = sortProducts(filtered, sortValue);
                    renderCategoryProducts(filtered, grid);
                }
            });
        });
    }

    // Sync dropdown with pill buttons
    if (categoryFilter) {
        categoryFilter.addEventListener('change', function() {
            const value = this.value;
            filterButtons.forEach(btn => {
                btn.classList.toggle('active', btn.dataset.filter === value);
            });
        });
    }
});

function renderCategoryProducts(productsList, grid) {
    if (!grid) return;
    window.finishProductGridLoading?.(grid);

    if (productsList.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 60px 0;">
                <i class="fas fa-search" style="font-size: 3rem; color: #ddd;"></i>
                <h3 style="margin-top: 20px;">No products found</h3>
                <p style="color: #777777;">Try adjusting your filters</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = productsList.map((product, index) => `
        <div class="product-card" data-id="${product.id}" onclick="window.location.href='product.html?id=${product.id}'">
            <div class="product-image">
                <img ${window.LuxeMedia.attributes(product.image, {
                    preset: 'card',
                    alt: product.name,
                    priority: index === 0,
                })}>
                ${product.discount && product.oldPrice ? `<span class="discount-badge">${Math.round((1 - product.price / product.oldPrice) * 100)}% OFF</span>` : ''}
                ${product.trending ? `<span class="trending-badge"><i class="fas fa-fire"></i> Trending</span>` : ''}
                <div class="product-actions">
                    <button class="add-cart" onclick="event.stopPropagation(); if(typeof window.addToCart==='function') window.addToCart(${product.id});"><i class="fas fa-shopping-bag"></i> Add</button>
                    <button class="wishlist-btn" onclick="event.stopPropagation(); if(typeof window.toggleWishlist==='function') window.toggleWishlist(${product.id}, this);"><i class="fas fa-heart"></i></button>
                    <button class="quick-view" onclick="event.stopPropagation(); window.location.href='product.html?id=${product.id}'"><i class="fas fa-eye"></i></button>
                </div>
            </div>
            <div class="product-info">
                <h4 class="product-name">${product.name}</h4>
                <p class="product-category">${product.category}${product.subcategory ? ' / ' + product.subcategory : ''}</p>
                <div class="product-price">
                    $${product.price.toFixed(2)}
                    ${product.oldPrice ? `<span class="old-price">$${product.oldPrice.toFixed(2)}</span>` : ''}
                </div>
            </div>
        </div>
    `).join('');
    window.LuxeMedia.hydrate(grid);
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
