// js/dashboard.js
// Powers dashboard.html: guards the page behind a real login,
// loads the profile + order history from Supabase, and handles
// the profile form and sign-out button.

document.addEventListener('DOMContentLoaded', async () => {
    const loader = document.getElementById('loader');
    if (loader) setTimeout(() => { loader.style.display = 'none'; }, 300);

    const guestView = document.getElementById('dashboardGuest');
    const layoutView = document.getElementById('dashboardLayout');

    if (!window.LuxeAuth || !window.LuxeAuth.isReady()) {
        if (guestView) guestView.style.display = 'block';
        return;
    }

    const user = await window.LuxeAuth.getCurrentUser();

    if (!user) {
        if (guestView) guestView.style.display = 'block';
        return;
    }

    if (layoutView) layoutView.style.display = 'grid';

    // ---------------- Sidebar user card ----------------
    const fullName = (user.user_metadata && user.user_metadata.full_name) || 'Member';
    const sidebarName = document.getElementById('sidebarName');
    const sidebarEmail = document.getElementById('sidebarEmail');
    if (sidebarName) sidebarName.textContent = fullName;
    if (sidebarEmail) sidebarEmail.textContent = user.email;

    // ---------------- Tab switching ----------------
    const navBtns = document.querySelectorAll('.dashboard-nav-btn');
    const panels = document.querySelectorAll('.dashboard-panel');
    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            navBtns.forEach(b => b.classList.remove('active'));
            panels.forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            const panel = document.getElementById('panel-' + btn.dataset.tab);
            if (panel) panel.classList.add('active');
        });
    });

    // ---------------- Profile panel ----------------
    const profileFullName = document.getElementById('profileFullName');
    const profileEmail = document.getElementById('profileEmail');
    const profilePhone = document.getElementById('profilePhone');

    if (profileEmail) profileEmail.value = user.email;
    if (profileFullName) profileFullName.value = fullName;

    if (window.LuxeProfile) {
        const profile = await window.LuxeProfile.get(user.id);
        if (profile) {
            if (profileFullName && profile.full_name) profileFullName.value = profile.full_name;
            if (profilePhone && profile.phone) profilePhone.value = profile.phone;
        }
    }

    const profileForm = document.getElementById('profileForm');
    if (profileForm) {
        profileForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = profileForm.querySelector('button[type="submit"]');
            if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }

            const { error } = await window.LuxeProfile.update(user.id, {
                full_name: profileFullName ? profileFullName.value.trim() : '',
                phone: profilePhone ? profilePhone.value.trim() : ''
            });

            if (btn) { btn.disabled = false; btn.textContent = 'Save Changes'; }

            if (error) {
                alert('Could not save changes: ' + error.message);
                return;
            }

            // Keep the sidebar + localStorage cache in sync
            if (sidebarName && profileFullName) sidebarName.textContent = profileFullName.value.trim();
            const cached = JSON.parse(localStorage.getItem('luxe_user') || '{}');
            cached.fullName = profileFullName ? profileFullName.value.trim() : cached.fullName;
            localStorage.setItem('luxe_user', JSON.stringify(cached));

            alert('Profile updated!');
        });
    }

    // ---------------- Orders panel ----------------
    const ordersList = document.getElementById('ordersList');
    if (ordersList && window.LuxeOrders) {
        const orders = await window.LuxeOrders.getOrders(user.id);

        if (!orders || orders.length === 0) {
            ordersList.innerHTML = `
                <div class="orders-empty">
                    <i class="fas fa-box-open"></i>
                    <p>You haven't placed any orders yet.</p>
                </div>
            `;
        } else {
            ordersList.innerHTML = orders.map(order => renderOrderCard(order)).join('');
        }
    }

    // ---------------- Sign out ----------------
    const signOutBtn = document.getElementById('signOutBtn');
    if (signOutBtn) {
        signOutBtn.addEventListener('click', async () => {
            await window.LuxeAuth.signOut();
            localStorage.removeItem('luxe_user');
            localStorage.removeItem('luxe_logged_in');
            window.location.href = 'index.html';
        });
    }
});

function renderOrderCard(order) {
    const date = new Date(order.created_at).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric'
    });
    const items = order.order_items || [];

    const itemsHtml = items.map(item => `
        <div class="order-line-item">
            <img src="${item.image_url || 'https://via.placeholder.com/48'}" alt="${escapeHtml(item.product_name)}">
            <span class="item-name">${escapeHtml(item.product_name)}</span>
            <span class="item-qty">x${item.quantity}</span>
            <span class="item-price">$${Number(item.price).toFixed(2)}</span>
        </div>
    `).join('');

    return `
        <div class="order-card">
            <div class="order-card-header">
                <div>
                    <div class="order-number">${escapeHtml(order.order_number)}</div>
                    <div class="order-date">${date}</div>
                </div>
                <span class="order-status ${order.status}">${order.status}</span>
            </div>
            <div class="order-card-body">
                ${itemsHtml}
            </div>
            <div class="order-card-footer">
                Total: $${Number(order.total).toFixed(2)}
            </div>
        </div>
    `;
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
}
