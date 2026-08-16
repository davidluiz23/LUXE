// js/product.js - Product Detail Page Logic

// Hide loader immediately
(function hideLoader() {
    const loader = document.getElementById('loader');
    if (loader) {
        loader.style.display = 'none';
        loader.style.opacity = '0';
        loader.style.visibility = 'hidden';
        loader.classList.add('hidden');
    }
})();

// Get product ID from URL
const urlParams = new URLSearchParams(window.location.search);
const productId = parseInt(urlParams.get('id'));

// Load product
const product = (typeof getProductById === 'function') ? getProductById(productId) : ((window.products || []).find(p => p.id === productId));

// Render product details when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Hide loader again
    const loader = document.getElementById('loader');
    if (loader) {
        loader.style.display = 'none';
        loader.classList.add('hidden');
    }

    if (!product) {
        const container = document.getElementById('productDetails');
        if (container) {
            container.innerHTML = `
                <div style="text-align: center; padding: 80px 0;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 3rem; color: #E74C3C; margin-bottom: 20px;"></i>
                    <h2>Product Not Found</h2>
                    <p style="color: #777; margin-bottom: 20px;">The product you are looking for does not exist or has been removed.</p>
                    <a href="shop.html" class="btn btn-primary">Return to Shop</a>
                </div>
            `;
        }
        return;
    }
    
    renderProductDetails(product);
    renderRelatedProducts(product);
});

function renderProductDetails(product) {
    const container = document.getElementById('productDetails');
    if (!container) return;

    // Generate star rating HTML
    const starsHtml = generateStars(product.rating || 4.5);

    // Generate color options HTML
    const colorsHtml = (product.colors || ['Black', 'Navy', 'Grey']).map(color => `
        <button class="color-btn" style="background: ${color.toLowerCase().includes('/') ? color.split('/')[0].toLowerCase() : color.toLowerCase()}" data-color="${color}" title="${color}"></button>
    `).join('');

    // Generate size options HTML
    const sizesHtml = (product.sizes || ['S', 'M', 'L', 'XL']).map(size => `
        <button class="size-btn-product" data-size="${size}">${size}</button>
    `).join('');

    // Generate specs HTML
    const specsHtml = `
        <div class="spec-item"><span class="spec-label">Category</span><span class="spec-value">${product.category}</span></div>
        <div class="spec-item"><span class="spec-label">Subcategory</span><span class="spec-value">${product.subcategory || 'Collection'}</span></div>
        <div class="spec-item"><span class="spec-label">Brand</span><span class="spec-value">${product.brand || 'LUXE'}</span></div>
        <div class="spec-item"><span class="spec-label">Rating</span><span class="spec-value">${product.rating || 4.5} / 5</span></div>
    `;

    const discountPercent = (product.discount && product.oldPrice && product.oldPrice > product.price) 
        ? Math.round((1 - product.price / product.oldPrice) * 100) 
        : 0;

    container.innerHTML = `
        <div class="product-detail-grid">
            <!-- Product Gallery -->
            <div class="product-gallery">
                <img src="${product.image}" alt="${product.name}" class="main-image" id="mainImage">
                ${discountPercent > 0 ? `<span class="discount-badge-large">${discountPercent}% OFF</span>` : ''}
                <div class="thumbnail-grid">
                    <img src="${product.image}" alt="Thumbnail 1" class="active" onclick="window.changeImage(this, '${product.image}')">
                    <img src="${product.hoverImage || product.image}" alt="Thumbnail 2" onclick="window.changeImage(this, '${product.hoverImage || product.image}')">
                    <img src="${product.image}" alt="Thumbnail 3" onclick="window.changeImage(this, '${product.image}')">
                    <img src="${product.hoverImage || product.image}" alt="Thumbnail 4" onclick="window.changeImage(this, '${product.hoverImage || product.image}')">
                </div>
            </div>

            <!-- Product Info -->
            <div class="product-info">
                <span class="product-category">${product.category} / ${product.subcategory || 'Collection'}</span>
                <h1>${product.name}</h1>
                
                <div class="product-rating">
                    <span class="stars">${starsHtml}</span>
                    <span class="rating-count">(${product.rating || 4.5} reviews)</span>
                </div>

                <div class="product-price-section">
                    <span class="current-price">$${product.price.toFixed(2)}</span>
                    ${product.oldPrice ? `<span class="old-price">$${product.oldPrice.toFixed(2)}</span>` : ''}
                </div>

                <div class="availability ${product.inStock !== false ? '' : 'out-of-stock'}">
                    <i class="fas ${product.inStock !== false ? 'fa-check-circle' : 'fa-times-circle'}"></i>
                    ${product.inStock !== false ? 'In Stock' : 'Out of Stock'}
                </div>

                <p class="product-description">${product.description || 'Crafted with premium materials and sophisticated design.'}</p>

                <div class="product-specs">
                    ${specsHtml}
                </div>

                <!-- Color Selection -->
                <div class="color-selection">
                    <label>Color:</label>
                    <div class="color-options">
                        ${colorsHtml}
                    </div>
                </div>

                <!-- Size Selection -->
                <div class="size-selection">
                    <label>Size:</label>
                    <div class="size-options">
                        ${sizesHtml}
                    </div>
                </div>

                <!-- Quantity -->
                <div class="quantity-selector">
                    <label>Quantity:</label>
                    <div class="quantity-control">
                        <button onclick="window.updateQuantity(-1)">−</button>
                        <span id="quantityDisplay">1</span>
                        <button onclick="window.updateQuantity(1)">+</button>
                    </div>
                </div>

                <!-- ADD TO CART & WHATSAPP -->
                <div class="product-actions-detail" style="display: flex; gap: 12px; flex-wrap: wrap; align-items: center;">
                    <button class="add-to-cart" onclick="window.addToCartHandler(${product.id})">
                        <i class="fas fa-shopping-bag"></i> Add to Cart
                    </button>
                    <button class="whatsapp-btn-product" onclick="window.sendProductToWhatsApp(${product.id}, parseInt(document.getElementById('quantityDisplay').textContent || 1))" style="background: #25D366; color: white; border: none; padding: 14px 22px; border-radius: 30px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 8px; font-size: 0.95rem; transition: background 0.3s ease;">
                        <i class="fab fa-whatsapp" style="font-size: 1.2rem;"></i> Order via WhatsApp
                    </button>
                    <button class="wishlist-btn-product" onclick="window.addToWishlistHandler(${product.id})">
                        <i class="fas fa-heart"></i>
                    </button>
                </div>

                <!-- Meta -->
                <div class="product-meta">
                    <div class="meta-item"><i class="fas fa-tag"></i> SKU: LUXE-${String(product.id).padStart(4, '0')}</div>
                    <div class="meta-item"><i class="fas fa-box"></i> Free shipping on orders $200+</div>
                    <div class="meta-item"><i class="fas fa-undo"></i> 30-day returns</div>
                </div>
            </div>
        </div>
    `;

    // Set default active color and size
    const firstColor = container.querySelector('.color-btn');
    if (firstColor) firstColor.classList.add('active');

    const firstSize = container.querySelector('.size-btn-product');
    if (firstSize) firstSize.classList.add('active');

    // Color selection
    container.querySelectorAll('.color-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            container.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
        });
    });

    // Size selection
    container.querySelectorAll('.size-btn-product').forEach(btn => {
        btn.addEventListener('click', function() {
            container.querySelectorAll('.size-btn-product').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
        });
    });
}

function generateStars(rating) {
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;
    let stars = '';
    
    for (let i = 0; i < fullStars; i++) {
        stars += '<i class="fas fa-star"></i>';
    }
    if (hasHalfStar) {
        stars += '<i class="fas fa-star-half-alt"></i>';
    }
    const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);
    for (let i = 0; i < emptyStars; i++) {
        stars += '<i class="far fa-star"></i>';
    }
    
    return stars;
}

function renderRelatedProducts(product) {
    const container = document.getElementById('relatedProducts');
    if (!container) return;

    const allProducts = (typeof getProducts === 'function') ? getProducts() : (window.products || []);
    let related = allProducts.filter(p => 
        p.category === product.category && p.id !== product.id
    );
    
    related = related.slice(0, 4);

    if (related.length === 0) {
        container.innerHTML = `<p style="grid-column: 1/-1; text-align: center; color: #777777; padding: 40px 0;">No related products found.</p>`;
        return;
    }

    container.innerHTML = related.map(p => `
        <div class="product-card" data-id="${p.id}" onclick="window.location.href='product.html?id=${p.id}'">
            <div class="product-image">
                <img src="${p.image}" alt="${p.name}" loading="lazy">
                ${p.discount && p.oldPrice ? `<span class="discount-badge">${Math.round((1 - p.price / p.oldPrice) * 100)}% OFF</span>` : ''}
                <div class="product-actions">
                    <button class="add-cart" onclick="event.stopPropagation(); if(typeof window.addToCart==='function') window.addToCart(${p.id});"><i class="fas fa-shopping-bag"></i> Add</button>
                    <button class="wishlist-btn" onclick="event.stopPropagation(); if(typeof window.toggleWishlist==='function') window.toggleWishlist(${p.id}, this);"><i class="fas fa-heart"></i></button>
                </div>
            </div>
            <div class="product-info">
                <h4 class="product-name">${p.name}</h4>
                <p class="product-category">${p.category}</p>
                <div class="product-price">
                    $${p.price.toFixed(2)}
                    ${p.oldPrice ? `<span class="old-price">$${p.oldPrice.toFixed(2)}</span>` : ''}
                </div>
            </div>
        </div>
    `).join('');
}

// Global window functions for inline onclick handlers
window.changeImage = function(elem, src) {
    const mainImage = document.getElementById('mainImage');
    if (mainImage && src) {
        mainImage.src = src;
    }
    document.querySelectorAll('.thumbnail-grid img').forEach(img => {
        img.classList.remove('active');
    });
    if (elem && elem.classList) {
        elem.classList.add('active');
    }
};

window.updateQuantity = function(delta) {
    const display = document.getElementById('quantityDisplay');
    if (!display) return;
    let current = parseInt(display.textContent);
    current = Math.max(1, current + delta);
    display.textContent = current;
};

window.addToCartHandler = function(id) {
    const display = document.getElementById('quantityDisplay');
    const quantity = display ? parseInt(display.textContent) : 1;
    if (typeof addToCart === 'function') {
        addToCart(id, quantity);
    } else if (typeof window.addToCart === 'function') {
        window.addToCart(id, quantity);
    }
};

window.addToWishlistHandler = function(id) {
    if (typeof addToWishlist === 'function') {
        addToWishlist(id);
    } else if (typeof window.addToWishlist === 'function') {
        window.addToWishlist(id);
    }
};