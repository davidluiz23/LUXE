// Editorial photographs are not inventory. Products are published through admin.
// No unrelated starter merchandise is bundled or imported.
const products = [];

// The public collection is the three original ALKEBULAN tees. Keep this
// curation at the catalog boundary so search, direct product URLs, saved bags
// and recommendations cannot reintroduce the retired starter merchandise.
// This is a presentation rule, not database authorization: admin still reads
// and manages every record through LuxeProducts and its own product cache.
function collectionText(value) {
    return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/[\u2010-\u2015-]/g, ' ').replace(/\s+/g, ' ').trim();
}

function collectionKeyForProduct(product) {
    if (!product || collectionText(product.brand) !== 'alkebulan') return null;
    // Match complete product names, not an incidental word in a description,
    // tag or an unrelated item such as "Ijele print trainers".
    const match = collectionText(product.name).match(
        /^(?:alkebulan )?(ijele|durbar|dun dun)(?: (?:(?:oversized )?graphic |oversized )?(?:tee|t shirt|tshirt))?$/,
    );
    return match ? match[1].replace(' ', '-') : null;
}

window.LuxeCollection = Object.freeze({
    keyForProduct: collectionKeyForProduct,
    includes: (product) => collectionKeyForProduct(product) !== null,
});

const catalogBackendConfigured = !!(
    window.LuxeProducts &&
    window.isSupabaseConfigured &&
    window.isSupabaseConfigured()
);

function catalogProducts(value) {
    return Array.isArray(value)
        ? value.filter((product) => {
            const id = Number(product?.id);
            return product && typeof product === 'object' && Number.isInteger(id) && id > 0;
        })
        : [];
}

let activeProductsList = catalogBackendConfigured ? [] : catalogProducts(products);
let liveCatalogRequest = null;

window.LuxeCatalogStatus = {
    state: catalogBackendConfigured ? 'idle' : 'offline',
    source: catalogBackendConfigured ? 'supabase' : 'bundled',
    message: catalogBackendConfigured
        ? 'Loading the collection...'
        : 'Offline catalog preview — the live catalog is not configured.',
};

function renderCatalogStatus() {
    if (document.readyState === 'loading') return;
    const status = window.LuxeCatalogStatus;
    let banner = document.getElementById('catalogStatusBanner');
    // Collection grids own their empty state; inventory comes from admin.
    // Avoid duplicating that state in a banner above the page.
    if (status.state === 'empty' && document.body.classList.contains('african-modern-site') &&
        (document.querySelector('.modern-collection, .modern-catalog') || document.body.dataset.collectionDesign)) {
        banner?.remove();
        return;
    }
    // Loading is already represented by the quiet, layout-stable product
    // placeholders. Avoid pushing every page down with a refresh banner.
    if (['idle', 'loading', 'ready'].includes(status.state)) {
        banner?.remove();
        return;
    }
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'catalogStatusBanner';
        banner.style.cssText = 'padding:10px 18px;text-align:center;background:#f4efe5;color:#2a261f;border-bottom:1px solid #d9cfbd;font:600 13px/1.5 var(--font-body),sans-serif;letter-spacing:.02em;';
        document.body.prepend(banner);
    }
    banner.setAttribute('role', status.state === 'unavailable' ? 'alert' : 'status');
    banner.textContent = status.message;
}

function setCatalogStatus(state, source, message) {
    Object.assign(window.LuxeCatalogStatus, { state, source, message });
    if (typeof window.CustomEvent === 'function') {
        window.dispatchEvent(new CustomEvent('luxe:catalog-status', {
            detail: { ...window.LuxeCatalogStatus },
        }));
    }
    renderCatalogStatus();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderCatalogStatus, { once: true });
} else {
    renderCatalogStatus();
}

function showProductGridLoading(grid, requestedCount = 8) {
    if (!grid) return;
    if (window.LuxeCatalogUI) return window.LuxeCatalogUI.loading(grid, requestedCount);

    const count = window.matchMedia('(max-width: 768px)').matches
        ? Math.min(4, requestedCount)
        : requestedCount;

    grid.classList.add('product-grid-loading');
    grid.setAttribute('aria-busy', 'true');
    grid.innerHTML = `<span class="sr-only" role="status">Loading the ALKEBULAN collection</span>${Array.from({ length: count }, (_, index) => `
        <article class="product-card product-card-skeleton" aria-hidden="true" style="--skeleton-order:${index}">
            <div class="product-image product-skeleton-image">${window.LuxeIcons?.loader() || ''}</div>
            <div class="product-info">
                <span class="product-skeleton-line short"></span>
                <span class="product-skeleton-line"></span>
                <span class="product-skeleton-line medium"></span>
            </div>
        </article>
    `).join('')}`;
}

function finishProductGridLoading(grid) {
    if (!grid) return;
    grid.classList.remove('product-grid-loading');
    grid.setAttribute('aria-busy', 'false');
}

async function loadCatalog() {
    let timeoutId;
    try {
        if (catalogBackendConfigured) {
            setCatalogStatus('loading', 'supabase', 'Loading the collection...');
            const timeoutResult = new Promise((resolve) => {
                timeoutId = setTimeout(() => resolve({
                    data: null,
                    error: { message: 'The live catalog request timed out.' },
                }), 12000);
            });
            const { data, error } = await Promise.race([
                window.LuxeProducts.getAll(),
                timeoutResult,
            ]);
            clearTimeout(timeoutId);
            if (!error && Array.isArray(data)) {
                const validProducts = catalogProducts(data);
                if (validProducts.length !== data.length) {
                    console.warn(`ALKEBULAN: ignored ${data.length - validProducts.length} malformed catalog row(s).`);
                }
                if (validProducts.length) {
                    activeProductsList = validProducts;
                    if (getProducts().length) {
                        setCatalogStatus('ready', 'supabase', 'Live catalog loaded.');
                    } else {
                        setCatalogStatus('empty', 'supabase', 'The ALKEBULAN tees are not available to shop yet.');
                    }
                } else if (data.length === 0) {
                    activeProductsList = [];
                    setCatalogStatus('empty', 'supabase', 'No products are currently published.');
                } else {
                    activeProductsList = [];
                    setCatalogStatus('unavailable', 'supabase', 'The live catalog returned invalid product data.');
                }
            } else if (error) {
                activeProductsList = [];
                setCatalogStatus('unavailable', 'supabase', 'The live catalog is temporarily unavailable. Please try again shortly.');
                console.warn('ALKEBULAN: could not load the live product catalog.', error.message || error);
            } else {
                activeProductsList = [];
                setCatalogStatus('unavailable', 'supabase', 'The live catalog returned an invalid response.');
                console.warn('ALKEBULAN: product catalog response was not an array.');
            }
        } else {
            setCatalogStatus('offline', 'bundled', 'Offline catalog preview — the live catalog is not configured.');
        }
    } catch (e) {
        activeProductsList = [];
        setCatalogStatus('unavailable', 'supabase', 'The live catalog is temporarily unavailable. Please try again shortly.');
        console.warn('ALKEBULAN: product fetch failed.', e);
    } finally {
        clearTimeout(timeoutId);
    }
    return getProducts();
}

function ensureLiveCatalog() {
    if (!liveCatalogRequest || window.LuxeCatalogStatus.state === 'unavailable') {
        liveCatalogRequest = loadCatalog();
        window.productsReady = liveCatalogRequest;
    }
    return liveCatalogRequest;
}

// Informational pages fetch products only when search is opened. Never present
// starter inventory as live inventory just because a page has no product grid.
const catalogPageFile = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
const catalogPageNeedsData = [
    'index.html', 'shop.html', 'men.html', 'women.html', 'product.html',
    'wishlist.html', 'cart.html', 'checkout.html', 'admin.html',
].includes(catalogPageFile);
window.ensureLiveCatalog = ensureLiveCatalog;
window.productsReady = catalogPageNeedsData ? ensureLiveCatalog() : Promise.resolve(getProducts());

// Get ALL products
function getProducts() {
    return catalogProducts(activeProductsList).filter(window.LuxeCollection.includes);
}

// Get a SINGLE product by its ID
function getProductById(id) {
    const numId = Number(id);
    return getProducts().find((product) => Number(product.id) === numId);
}

// Get products by category (Men, Women, Accessories, Footwear)
function getProductsByCategory(category) {
    const requestedCategory = String(category || '').trim().toLocaleLowerCase();
    if (!requestedCategory) return [];
    return getProducts().filter((product) =>
        String(product.category || '').trim().toLocaleLowerCase() === requestedCategory,
    );
}

// Get ONLY Men's products
function getMenProducts() {
    return getProductsByCategory('Men');
}

// Get ONLY Women's products
function getWomenProducts() {
    return getProductsByCategory('Women');
}

// Get featured products (first 8)
function getFeaturedProducts() {
    return getProducts().slice(0, 8);
}

// Get new arrivals (last 8)
function getNewArrivals() {
    return getProducts().slice(-8);
}

// Search products by name, brand, category, or tags
function searchProducts(query) {
    const searchQuery = String(query || '').toLocaleLowerCase().trim();
    return getProducts().filter((product) => {
        const fields = [
            product.name,
            product.brand,
            product.category,
            product.subcategory,
            ...(Array.isArray(product.tags) ? product.tags : []),
        ];
        return fields.some((field) =>
            String(field || '').toLocaleLowerCase().includes(searchQuery),
        );
    });
}

// ---------------------------------------------------------------------
// Admin-only writes below. These talk to Supabase directly and will
// fail (safely, with an error object) for anyone who isn't logged in
// as the owner — that's enforced by database Row Level Security, not
// by this file. The admin panel (js/admin.js) is what calls these.
// ---------------------------------------------------------------------

// Add a new product. Returns { data, error }.
async function addProduct(productData) {
    if (!window.LuxeProducts) return { data: null, error: { message: 'Backend not configured' } };
    const { data, error } = await window.LuxeProducts.create(productData);
    if (!error && data) {
        activeProductsList = [data, ...activeProductsList];
    }
    return { data, error };
}

// Update existing product. Returns { data, error }.
async function updateProduct(id, updatedData) {
    if (!window.LuxeProducts) return { data: null, error: { message: 'Backend not configured' } };
    const { data, error } = await window.LuxeProducts.update(id, updatedData);
    if (!error && data) {
        const numId = Number(id);
        activeProductsList = activeProductsList.map(p => p.id === numId ? data : p);
    }
    return { data, error };
}

// Delete product. Returns { error }.
async function deleteProduct(id) {
    if (!window.LuxeProducts) return { error: { message: 'Backend not configured' } };
    const { error } = await window.LuxeProducts.remove(id);
    if (!error) {
        const numId = Number(id);
        activeProductsList = activeProductsList.filter(p => p.id !== numId);
    }
    return { error };
}

// One-time import of the bundled starter catalog into Supabase.
// Used by the admin panel's "Import starter catalog" button.
async function importStarterCatalog() {
    if (!products.length) return { data: [], imported: 0, error: null };
    if (!window.LuxeProducts) return { error: { message: 'Backend not configured' } };
    const result = await window.LuxeProducts.importStarterCatalog(products);
    if (!result.error) {
        // Refresh local cache from the DB so the admin panel shows the
        // freshly imported rows immediately.
        const { data, error } = await window.LuxeProducts.getAll();
        if (!error && Array.isArray(data)) activeProductsList = catalogProducts(data);
    }
    return result;
}

if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'products', {
        get: function () { return getProducts(); },
        set: function (val) { activeProductsList = catalogProducts(val); },
        configurable: true
    });
    window.getProducts = getProducts;
    window.getProductById = getProductById;
    window.getProductsByCategory = getProductsByCategory;
    window.getMenProducts = getMenProducts;
    window.getWomenProducts = getWomenProducts;
    window.getFeaturedProducts = getFeaturedProducts;
    window.getNewArrivals = getNewArrivals;
    window.searchProducts = searchProducts;
    window.showProductGridLoading = showProductGridLoading;
    window.finishProductGridLoading = finishProductGridLoading;
    window.addProduct = addProduct;
    window.updateProduct = updateProduct;
    window.deleteProduct = deleteProduct;
    window.importStarterCatalog = importStarterCatalog;
    window.getStarterProducts = () => products.slice();
}
