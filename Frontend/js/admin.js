// js/admin.js - Admin Panel Logic
//
// Access is controlled by the `admin_users` table in Supabase, keyed
// to each account's real UUID (not email) — see
// supabase/migrations/20260819000000_luxe-consolidation-fix.sql.
// Anyone in that table can sign in here; admins can add/remove other
// admins from the Team tab. The is_admin() database function enforces
// this server-side on every read/write, so this check is just for a
// fast, friendly redirect — the database is what actually blocks
// anyone not on the list.

let currentAdminUserId = null;

document.addEventListener('DOMContentLoaded', async () => {
    if (!window.LuxeAuth || !window.LuxeAuth.isReady()) {
        showToast('Backend not configured — check js/supabase-client.js', true);
        return;
    }

    const loginGate = document.getElementById('adminLoginGate');
    const deniedGate = document.getElementById('adminDeniedGate');
    const layout = document.getElementById('adminLayout');

    async function checkAccess() {
        const user = await window.LuxeAuth.getCurrentUser();
        if (!user) {
            loginGate.style.display = 'block';
            deniedGate.style.display = 'none';
            layout.classList.remove('visible');
            return;
        }
        const isAdmin = await window.LuxeAdmins.isAdmin();
        if (!isAdmin) {
            loginGate.style.display = 'none';
            deniedGate.style.display = 'block';
            layout.classList.remove('visible');
            return;
        }
        currentAdminUserId = user.id;
        loginGate.style.display = 'none';
        deniedGate.style.display = 'none';
        layout.classList.add('visible');
        document.getElementById('adminOwnerEmail').textContent = user.email;
        await loadProducts();
        await loadUpdates();
        await loadTeam();
    }

    await checkAccess();

    // ---------------- Login form ----------------
    const loginForm = document.getElementById('adminLoginForm');
    const loginError = document.getElementById('adminLoginError');
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        loginError.classList.remove('visible');
        const email = document.getElementById('adminEmail').value.trim();
        const password = document.getElementById('adminPassword').value;
        const btn = document.getElementById('adminLoginBtn');
        btn.disabled = true;
        btn.textContent = 'Signing in...';
        const { error } = await window.LuxeAuth.signInWithPassword(email, password);
        btn.disabled = false;
        btn.textContent = 'Sign In';
        if (error) {
            loginError.textContent = error.message || 'Sign in failed.';
            loginError.classList.add('visible');
            return;
        }
        await checkAccess();
    });

    // ---------------- Sign out (both gates) ----------------
    document.getElementById('adminSignOutBtn').addEventListener('click', async () => {
        await window.LuxeAuth.signOut();
        currentAdminUserId = null;
        await checkAccess();
    });
    document.getElementById('adminDeniedSignOut').addEventListener('click', async () => {
        await window.LuxeAuth.signOut();
        await checkAccess();
    });

    // ---------------- Sidebar tab switching ----------------
    const navBtns = document.querySelectorAll('.admin-nav-btn[data-panel]');
    const panels = document.querySelectorAll('.admin-panel');
    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            navBtns.forEach(b => b.classList.remove('active'));
            panels.forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(btn.dataset.panel).classList.add('active');
        });
    });

    // ================= PRODUCTS =================
    const productsTableBody = document.getElementById('productsTableBody');
    const productsEmptyState = document.getElementById('productsEmptyState');
    const productCountLabel = document.getElementById('productCountLabel');
    const productModalOverlay = document.getElementById('productModalOverlay');
    const productForm = document.getElementById('productForm');
    const productModalTitle = document.getElementById('productModalTitle');

    async function loadProducts() {
        productCountLabel.textContent = 'Loading catalog…';
        const { data, error } = await window.LuxeProducts.getAll();
        if (error) {
            productCountLabel.textContent = 'Could not load products.';
            showToast(error.message || 'Failed to load products', true);
            return;
        }
        renderProductsTable(data);
        productCountLabel.textContent = `${data.length} product${data.length === 1 ? '' : 's'} in the live catalog`;
    }

    function renderProductsTable(list) {
        if (!list.length) {
            productsTableBody.innerHTML = '';
            productsEmptyState.style.display = 'block';
            return;
        }
        productsEmptyState.style.display = 'none';
        productsTableBody.innerHTML = list.map(p => `
            <tr>
                <td><img src="${escapeAttr(p.image)}" alt="" onerror="this.style.visibility='hidden'"></td>
                <td class="product-name-cell">${escapeHtml(p.name)}</td>
                <td>${escapeHtml(p.brand || '')}</td>
                <td>${escapeHtml(p.category || '')}</td>
                <td>$${Number(p.price).toFixed(2)}</td>
                <td><span class="admin-badge ${p.inStock ? 'in-stock' : 'out-stock'}">${p.inStock ? 'In Stock' : 'Out'}</span></td>
                <td>
                    <div class="admin-row-actions">
                        <button class="admin-icon-btn edit-product-btn" data-id="${p.id}" title="Edit"><i class="fas fa-pen"></i></button>
                        <button class="admin-icon-btn delete-btn delete-product-btn" data-id="${p.id}" title="Delete"><i class="fas fa-trash"></i></button>
                    </div>
                </td>
            </tr>
        `).join('');

        productsTableBody.querySelectorAll('.edit-product-btn').forEach(btn => {
            btn.addEventListener('click', () => openProductModal(Number(btn.dataset.id)));
        });
        productsTableBody.querySelectorAll('.delete-product-btn').forEach(btn => {
            btn.addEventListener('click', () => confirmDeleteProduct(Number(btn.dataset.id)));
        });
    }

    // ---------- Image upload wiring (shared by main + hover image) ----------
    function setImagePreview(previewImgId, previewIconId, url) {
        const img = document.getElementById(previewImgId);
        const icon = document.getElementById(previewIconId);
        if (url) {
            img.src = url;
            img.style.display = 'block';
            icon.style.display = 'none';
        } else {
            img.style.display = 'none';
            icon.style.display = 'block';
        }
    }

    function wireImageUpload(fileInputId, urlInputId, previewImgId, previewIconId, statusId) {
        const fileInput = document.getElementById(fileInputId);
        const urlInput = document.getElementById(urlInputId);
        const status = document.getElementById(statusId);

        fileInput.addEventListener('change', async () => {
            const file = fileInput.files[0];
            if (!file) return;
            status.textContent = 'Uploading…';
            status.style.color = '';
            const { url, error } = await window.LuxeStorage.uploadProductImage(file);
            if (error) {
                status.textContent = error.message || 'Upload failed';
                status.style.color = '#C0392B';
                return;
            }
            urlInput.value = url;
            setImagePreview(previewImgId, previewIconId, url);
            status.textContent = 'Uploaded ✓ (original quality kept)';
            status.style.color = '#1E8E4F';
        });

        urlInput.addEventListener('input', () => {
            setImagePreview(previewImgId, previewIconId, urlInput.value.trim());
            status.textContent = '';
        });
    }

    wireImageUpload('pImageFile', 'pImage', 'pImagePreview', 'pImagePreviewIcon', 'pImageUploadStatus');
    wireImageUpload('pHoverImageFile', 'pHoverImage', 'pHoverImagePreview', 'pHoverImagePreviewIcon', 'pHoverImageUploadStatus');

    function openProductModal(id) {
        productForm.reset();
        document.getElementById('productId').value = '';
        document.getElementById('pInStock').checked = true;
        document.getElementById('pImageUploadStatus').textContent = '';
        document.getElementById('pHoverImageUploadStatus').textContent = '';
        if (id) {
            const p = window.getProductById(id);
            if (!p) { showToast('Product not found', true); return; }
            productModalTitle.textContent = 'Edit Product';
            document.getElementById('productId').value = p.id;
            document.getElementById('pName').value = p.name || '';
            document.getElementById('pBrand').value = p.brand || '';
            document.getElementById('pCategory').value = p.category || 'Men';
            document.getElementById('pSubcategory').value = p.subcategory || '';
            document.getElementById('pRating').value = p.rating || '';
            document.getElementById('pPrice').value = p.price || '';
            document.getElementById('pOldPrice').value = p.oldPrice || '';
            document.getElementById('pImage').value = p.image || '';
            document.getElementById('pHoverImage').value = p.hoverImage || '';
            document.getElementById('pDescription').value = p.description || '';
            document.getElementById('pSizes').value = (p.sizes || []).join(', ');
            document.getElementById('pColors').value = (p.colors || []).join(', ');
            document.getElementById('pTags').value = (p.tags || []).join(', ');
            document.getElementById('pInStock').checked = !!p.inStock;
            setImagePreview('pImagePreview', 'pImagePreviewIcon', p.image);
            setImagePreview('pHoverImagePreview', 'pHoverImagePreviewIcon', p.hoverImage);
        } else {
            productModalTitle.textContent = 'Add Product';
            setImagePreview('pImagePreview', 'pImagePreviewIcon', null);
            setImagePreview('pHoverImagePreview', 'pHoverImagePreviewIcon', null);
        }
        productModalOverlay.classList.add('visible');
    }

    function closeProductModal() {
        productModalOverlay.classList.remove('visible');
    }

    document.getElementById('addProductBtn').addEventListener('click', () => openProductModal(null));
    document.getElementById('cancelProductBtn').addEventListener('click', closeProductModal);
    productModalOverlay.addEventListener('click', (e) => {
        if (e.target === productModalOverlay) closeProductModal();
    });

    productForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('productId').value;
        const price = parseFloat(document.getElementById('pPrice').value);
        if (isNaN(price) || price < 0) {
            showToast('Enter a valid price', true);
            return;
        }
        const payload = {
            name: document.getElementById('pName').value.trim(),
            brand: document.getElementById('pBrand').value.trim() || 'Luxe',
            category: document.getElementById('pCategory').value,
            subcategory: document.getElementById('pSubcategory').value.trim() || 'General',
            rating: document.getElementById('pRating').value || 5.0,
            price,
            oldPrice: document.getElementById('pOldPrice').value || null,
            image: document.getElementById('pImage').value.trim(),
            hoverImage: document.getElementById('pHoverImage').value.trim(),
            description: document.getElementById('pDescription').value.trim(),
            sizes: document.getElementById('pSizes').value,
            colors: document.getElementById('pColors').value,
            tags: document.getElementById('pTags').value,
            inStock: document.getElementById('pInStock').checked
        };

        const saveBtn = document.getElementById('saveProductBtn');
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';

        const { error } = id ? await window.updateProduct(id, payload) : await window.addProduct(payload);

        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Product';

        if (error) {
            showToast(error.message || 'Save failed — check you are still signed in as an admin.', true);
            return;
        }
        showToast(id ? 'Product updated' : 'Product added');
        closeProductModal();
        await loadProducts();
    });

    async function confirmDeleteProduct(id) {
        const p = window.getProductById(id);
        if (!confirm(`Delete "${p ? p.name : 'this product'}"? This can't be undone.`)) return;
        const { error } = await window.deleteProduct(id);
        if (error) {
            showToast(error.message || 'Delete failed', true);
            return;
        }
        showToast('Product deleted');
        await loadProducts();
    }

    document.getElementById('importCatalogBtn').addEventListener('click', async () => {
        const btn = document.getElementById('importCatalogBtn');
        btn.disabled = true;
        btn.textContent = 'Importing...';
        const { error, imported } = await window.importStarterCatalog();
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-cloud-upload-alt"></i> Import Starter Catalog';
        if (error) {
            showToast(error.message || 'Import failed', true);
            return;
        }
        showToast(imported ? `Imported ${imported} product(s)` : 'Already up to date — nothing new to import');
        await loadProducts();
    });

    // ================= SITE UPDATES =================
    const updatesList = document.getElementById('updatesList');
    const updatesEmptyState = document.getElementById('updatesEmptyState');

    async function loadUpdates() {
        const { data, error } = await window.LuxeUpdates.getAll();
        if (error) {
            showToast(error.message || 'Failed to load updates', true);
            return;
        }
        if (!data.length) {
            updatesList.innerHTML = '';
            updatesEmptyState.style.display = 'block';
            return;
        }
        updatesEmptyState.style.display = 'none';
        updatesList.innerHTML = data.map(u => `
            <div class="admin-update-item">
                <div>
                    <h4>${escapeHtml(u.title)}</h4>
                    <p>${escapeHtml(u.message)}</p>
                    <div class="admin-update-date">${new Date(u.created_at).toLocaleString()} ${u.active ? '' : '· inactive'}</div>
                </div>
                <button class="admin-icon-btn delete-btn delete-update-btn" data-id="${u.id}" title="Delete"><i class="fas fa-trash"></i></button>
            </div>
        `).join('');

        updatesList.querySelectorAll('.delete-update-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!confirm('Delete this update?')) return;
                const { error } = await window.LuxeUpdates.remove(btn.dataset.id);
                if (error) { showToast(error.message || 'Delete failed', true); return; }
                showToast('Update deleted');
                await loadUpdates();
            });
        });
    }

    document.getElementById('postUpdateForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const title = document.getElementById('updateTitle').value.trim();
        const message = document.getElementById('updateMessage').value.trim();
        const { error } = await window.LuxeUpdates.create(title, message);
        if (error) {
            showToast(error.message || 'Failed to post update', true);
            return;
        }
        document.getElementById('postUpdateForm').reset();
        showToast('Update posted');
        await loadUpdates();
    });

    // ================= TEAM =================
    const teamTableBody = document.getElementById('teamTableBody');

    async function loadTeam() {
        const { data, error } = await window.LuxeAdmins.getAll();
        if (error) {
            showToast(error.message || 'Failed to load team', true);
            return;
        }
        if (!data.length) {
            teamTableBody.innerHTML = `<tr><td colspan="4">No admins found.</td></tr>`;
            return;
        }
        teamTableBody.innerHTML = data.map(a => `
            <tr>
                <td>${escapeHtml(a.email)}${a.user_id === currentAdminUserId ? '<span class="admin-you-badge">You</span>' : ''}</td>
                <td>${escapeHtml(a.full_name || '—')}</td>
                <td>${new Date(a.added_at).toLocaleDateString()}</td>
                <td>
                    <div class="admin-row-actions">
                        <button class="admin-icon-btn delete-btn remove-admin-btn" data-userid="${escapeAttr(a.user_id)}" data-email="${escapeAttr(a.email)}" title="Remove"><i class="fas fa-trash"></i></button>
                    </div>
                </td>
            </tr>
        `).join('');

        teamTableBody.querySelectorAll('.remove-admin-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const userId = btn.dataset.userid;
                const email = btn.dataset.email;
                const isSelf = userId === currentAdminUserId;
                const warning = isSelf
                    ? `This is your own account — removing it will sign you out of the admin panel for good (unless another admin adds you back). Continue?`
                    : `Remove ${email} from the admin team?`;
                if (!confirm(warning)) return;
                const { error } = await window.LuxeAdmins.remove(userId);
                if (error) { showToast(error.message || 'Could not remove', true); return; }
                showToast('Removed from team');
                if (isSelf) {
                    await window.LuxeAuth.signOut();
                    await checkAccess();
                    return;
                }
                await loadTeam();
            });
        });
    }

    document.getElementById('addAdminForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('newAdminEmail').value.trim().toLowerCase();
        const { error } = await window.LuxeAdmins.add(email);
        if (error) {
            showToast(error.message || 'Could not add — make sure they already have a LUXE account', true);
            return;
        }
        document.getElementById('addAdminForm').reset();
        showToast('Team member added');
        await loadTeam();
    });

});

// ---------------- helpers ----------------
function showToast(message, isError) {
    const toast = document.getElementById('adminToast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.toggle('error-toast', !!isError);
    toast.classList.add('visible');
    clearTimeout(window.__adminToastTimer);
    window.__adminToastTimer = setTimeout(() => toast.classList.remove('visible'), 3200);
}

function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

function escapeAttr(str) {
    return escapeHtml(str);
}
