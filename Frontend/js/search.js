// js/search.js - Header & Page Live Search

document.addEventListener('DOMContentLoaded', async () => {
    // Wait for the live product catalog (Supabase) to finish loading.
    if (window.productsReady) await window.productsReady;
    const searchToggle = document.getElementById('searchToggle');

    // Create header search modal overlay dynamically if it doesn't exist
    let searchModal = document.getElementById('headerSearchModal');
    if (!searchModal) {
        searchModal = document.createElement('div');
        searchModal.id = 'headerSearchModal';
        searchModal.className = 'header-search-modal';
        searchModal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.7);
            backdrop-filter: blur(8px);
            z-index: 10000;
            display: none;
            align-items: flex-start;
            justify-content: center;
            padding-top: 100px;
            transition: opacity 0.3s ease;
        `;

        searchModal.innerHTML = `
            <div class="search-modal-content" style="
                background: #ffffff;
                width: 90%;
                max-width: 650px;
                border-radius: 12px;
                padding: 25px;
                position: relative;
                box-shadow: 0 20px 50px rgba(0,0,0,0.3);
            ">
                <button id="closeSearchModal" style="
                    position: absolute;
                    top: 15px;
                    right: 20px;
                    background: none;
                    border: none;
                    font-size: 1.5rem;
                    cursor: pointer;
                    color: #777;
                ">&times;</button>
                <div style="display: flex; align-items: center; border-bottom: 2px solid #111; padding-bottom: 10px; margin-bottom: 20px;">
                    <i class="fas fa-search" style="font-size: 1.2rem; color: #777; margin-right: 12px;"></i>
                    <input type="text" id="headerSearchInput" placeholder="Search products, brands, or categories..." style="
                        width: 100%;
                        border: none;
                        outline: none;
                        font-size: 1.1rem;
                        font-family: 'Poppins', sans-serif;
                    ">
                </div>
                <div id="headerSearchResults" style="max-height: 350px; overflow-y: auto;">
                    <p style="color: #999; text-align: center; margin: 20px 0;">Type to search LUXE products...</p>
                </div>
            </div>
        `;
        document.body.appendChild(searchModal);
    }

    const headerSearchInput = document.getElementById('headerSearchInput');
    const headerSearchResults = document.getElementById('headerSearchResults');
    const closeSearchModal = document.getElementById('closeSearchModal');

    function openSearch() {
        searchModal.style.display = 'flex';
        setTimeout(() => {
            if (headerSearchInput) headerSearchInput.focus();
        }, 100);
    }

    function closeSearch() {
        searchModal.style.display = 'none';
        if (headerSearchInput) headerSearchInput.value = '';
        if (headerSearchResults) {
            headerSearchResults.innerHTML = '<p style="color: #999; text-align: center; margin: 20px 0;">Type to search LUXE products...</p>';
        }
    }

    if (searchToggle) {
        searchToggle.addEventListener('click', (e) => {
            e.preventDefault();
            openSearch();
        });
    }

    if (closeSearchModal) {
        closeSearchModal.addEventListener('click', closeSearch);
    }

    if (searchModal) {
        searchModal.addEventListener('click', (e) => {
            if (e.target === searchModal) closeSearch();
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && searchModal && searchModal.style.display === 'flex') {
            closeSearch();
        }
    });

    if (headerSearchInput && headerSearchResults) {
        headerSearchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();
            if (query.length < 2) {
                headerSearchResults.innerHTML = '<p style="color: #999; text-align: center; margin: 20px 0;">Type at least 2 characters...</p>';
                return;
            }

            const getProds = (typeof getProducts === 'function') ? getProducts : (window.getProducts || function() { return window.products || []; });
            const products = getProds();

            const results = products.filter(p => 
                p.name.toLowerCase().includes(query) || 
                p.category.toLowerCase().includes(query) ||
                (p.subcategory && p.subcategory.toLowerCase().includes(query)) ||
                (p.brand && p.brand.toLowerCase().includes(query))
            );

            if (results.length === 0) {
                headerSearchResults.innerHTML = '<p style="color: #777; text-align: center; margin: 20px 0;">No products found</p>';
            } else {
                headerSearchResults.innerHTML = results.map(p => `
                    <a href="product.html?id=${p.id}" class="search-result-item" style="
                        display: flex;
                        align-items: center;
                        gap: 15px;
                        padding: 10px;
                        border-bottom: 1px solid #eee;
                        text-decoration: none;
                        color: #111;
                        transition: background 0.2s ease;
                    " onmouseover="this.style.background='#f8f8f8'" onmouseout="this.style.background='transparent'">
                        <img src="${p.image}" alt="${p.name}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 6px;">
                        <div style="flex: 1;">
                            <div style="font-weight: 500; font-size: 0.95rem;">${p.name}</div>
                            <div style="font-size: 0.8rem; color: #777;">${p.category} ${p.subcategory ? '• ' + p.subcategory : ''}</div>
                        </div>
                        <div style="font-weight: 600; color: #111;">$${p.price.toFixed(2)}</div>
                    </a>
                `).join('');
            }
        });
    }

    // Shop page inline search input listener
    const shopSearch = document.getElementById('shopSearch');
    if (shopSearch) {
        shopSearch.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();
            filterProducts(query);
        });
    }
});

function filterProducts(query) {
    const productCards = document.querySelectorAll('.product-card');
    productCards.forEach(card => {
        const name = card.querySelector('.product-name')?.textContent.toLowerCase() || '';
        const category = card.querySelector('.product-category')?.textContent.toLowerCase() || '';
        const matches = name.includes(query) || category.includes(query);
        card.style.display = matches ? 'block' : 'none';
    });
}

window.filterProducts = filterProducts;