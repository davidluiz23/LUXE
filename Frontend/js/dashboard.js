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

    const returnParams = new URLSearchParams(window.location.search);
    if (returnParams.get('payment') === 'return' && returnParams.get('reference') && window.LuxePayments) {
        const paymentOrder = await window.LuxeOrders.getByPaymentReference(returnParams.get('reference'));
        if (paymentOrder) {
            const { data } = await window.LuxePayments.verify(paymentOrder.id);
            window.history.replaceState({}, '', 'dashboard.html');
            if (data?.status === 'paid') {
                window.saveCart?.([]);
                window.updateCartCount?.();
                alert(`Payment confirmed for ${paymentOrder.order_number}.`);
            }
        }
    }

    // Start independent dashboard requests together to reduce time-to-content.
    const profileRequest = window.LuxeProfile
        ? window.LuxeProfile.get(user.id)
        : Promise.resolve(null);
    const ordersRequest = window.LuxeOrders
        ? window.LuxeOrders.getOrders(user.id)
        : Promise.resolve([]);
    const notificationsRequest = window.LuxeNotifications
        ? window.LuxeNotifications.getAll()
        : Promise.resolve({ data: [], error: null });
    const commerceSettingsRequest = window.LuxeCommerce
        ? window.LuxeCommerce.getSettings()
        : Promise.resolve({ whatsappVerificationRequired: false, whatsappDefaultCountryCode: '234' });

    // ---------------- Sidebar user card ----------------
    const fullName = (user.user_metadata && user.user_metadata.full_name) || 'Member';
    const sidebarName = document.getElementById('sidebarName');
    const sidebarEmail = document.getElementById('sidebarEmail');
    if (sidebarName) sidebarName.textContent = fullName;
    if (sidebarEmail) sidebarEmail.textContent = user.email;

    // ---------------- Avatar ----------------
    function renderAvatar(url) {
        const sidebarAvatar = document.getElementById('sidebarAvatar');
        const profilePreview = document.getElementById('profileAvatarPreview');
        [sidebarAvatar, profilePreview].filter(Boolean).forEach(container => {
            if (safeHttpUrl(url)) {
                const image = document.createElement('img');
                image.src = safeHttpUrl(url);
                image.alt = '';
                container.replaceChildren(image);
            } else {
                const icon = document.createElement('i');
                icon.className = 'fas fa-user';
                container.replaceChildren(icon);
            }
        });
    }

    const avatarFileInput = document.getElementById('avatarFile');
    const avatarStatus = document.getElementById('avatarUploadStatus');
    if (avatarFileInput) {
        avatarFileInput.addEventListener('change', async () => {
            const file = avatarFileInput.files[0];
            if (!file || !window.LuxeStorage) return;
            if (avatarStatus) { avatarStatus.textContent = 'Uploading…'; avatarStatus.style.color = ''; }

            const { url, error } = await window.LuxeStorage.uploadAvatar(file, user.id);
            if (error) {
                if (avatarStatus) { avatarStatus.textContent = error.message || 'Upload failed'; avatarStatus.style.color = '#C0392B'; }
                return;
            }

            const { error: saveError } = await window.LuxeProfile.update(user.id, { avatar_url: url });
            if (saveError) {
                if (avatarStatus) { avatarStatus.textContent = saveError.message || 'Uploaded, but could not save'; avatarStatus.style.color = '#C0392B'; }
                return;
            }

            renderAvatar(url);
            window.syncStorefrontNavigation?.();
            if (avatarStatus) { avatarStatus.textContent = 'Photo updated ✓ (original quality kept)'; avatarStatus.style.color = '#1E8E4F'; }
        });
    }

    // ---------------- Tab switching ----------------
    const navBtns = document.querySelectorAll('.dashboard-nav-btn');
    const panels = document.querySelectorAll('.dashboard-panel');
    navBtns.forEach(btn => {
        btn.addEventListener('click', async () => {
            navBtns.forEach(b => b.classList.remove('active'));
            panels.forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            const panel = document.getElementById('panel-' + btn.dataset.tab);
            if (panel) panel.classList.add('active');
            if (btn.dataset.tab === 'notifications' && window.LuxeNotifications) {
                await window.LuxeNotifications.markAllRead();
                setNotificationBadge(0);
                window.updateNavbarNotificationBadge?.(0, true);
                document.querySelectorAll('.dashboard-notification.is-unread').forEach(item => item.classList.remove('is-unread'));
            }
        });
    });
    const requestedTab = new URLSearchParams(window.location.search).get('tab');
    if (requestedTab === 'notifications') {
        document.getElementById('notificationsTabBtn')?.click();
    } else if (requestedTab === 'orders') {
        document.querySelector('.dashboard-nav-btn[data-tab="orders"]')?.click();
    }

    // ---------------- Profile panel ----------------
    const profileFullName = document.getElementById('profileFullName');
    const profileEmail = document.getElementById('profileEmail');
    const profilePhone = document.getElementById('profilePhone');
    const verificationStatus = document.getElementById('whatsappVerificationStatus');
    const verificationText = document.getElementById('whatsappVerificationText');
    const verificationNote = document.getElementById('whatsappRequirementNote');
    const requestCodeButton = document.getElementById('requestWhatsAppCode');
    const codePanel = document.getElementById('whatsappCodePanel');
    const codeInput = document.getElementById('whatsappCode');
    const verifyCodeButton = document.getElementById('verifyWhatsAppCode');
    const commerceSettings = await commerceSettingsRequest;
    const emailUpdatesPreference = document.getElementById('emailUpdatesPreference');
    const whatsappUpdatesPreference = document.getElementById('whatsappUpdatesPreference');
    const communicationPreferencesForm = document.getElementById('communicationPreferencesForm');
    const communicationPreferencesStatus = document.getElementById('communicationPreferencesStatus');
    const browserPushToggle = document.getElementById('browserPushToggle');
    const browserPushStatus = document.getElementById('browserPushStatus');
    let currentProfile = null;
    let verifiedWhatsAppPhone = null;

    if (profileEmail) profileEmail.value = user.email;
    if (profileFullName) profileFullName.value = fullName;

    if (window.LuxeProfile) {
        currentProfile = await profileRequest;
        if (currentProfile) {
            if (profileFullName && currentProfile.full_name) profileFullName.value = currentProfile.full_name;
            verifiedWhatsAppPhone = currentProfile.whatsapp_verified_at ? currentProfile.whatsapp_phone : null;
            if (profilePhone) profilePhone.value = verifiedWhatsAppPhone || currentProfile.phone || '';
            if (currentProfile.avatar_url) renderAvatar(currentProfile.avatar_url);
            if (emailUpdatesPreference) emailUpdatesPreference.checked = !!currentProfile.email_updates_opt_in_at;
            if (whatsappUpdatesPreference) whatsappUpdatesPreference.checked = !!currentProfile.whatsapp_updates_opt_in_at;
        }
    }

    function refreshCommunicationPreferences() {
        if (!whatsappUpdatesPreference) return;
        whatsappUpdatesPreference.disabled = !verifiedWhatsAppPhone;
        if (!verifiedWhatsAppPhone) whatsappUpdatesPreference.checked = false;
    }

    refreshCommunicationPreferences();

    async function refreshBrowserPushState() {
        if (!browserPushToggle || !browserPushStatus || !window.LuxePush) return;
        const state = await window.LuxePush.getState();
        browserPushToggle.classList.toggle('is-enabled', !!state.subscribed);
        browserPushToggle.disabled = !state.supported || state.permission === 'denied';
        browserPushToggle.textContent = state.subscribed ? 'Turn off' : 'Enable';

        if (!state.supported) {
            browserPushStatus.textContent = 'Open the site over HTTPS or localhost; push cannot run from a file:// page.';
        } else if (state.permission === 'denied') {
            browserPushStatus.textContent = 'Blocked in browser settings. Allow notifications for this site to continue.';
        } else if (state.subscribed) {
            browserPushStatus.textContent = 'On for this browser—even when the site tab is closed.';
        } else {
            browserPushStatus.textContent = 'Get order and account alerts when the site is closed.';
        }
    }

    browserPushToggle?.addEventListener('click', async () => {
        browserPushToggle.disabled = true;
        if (communicationPreferencesStatus) {
            communicationPreferencesStatus.textContent = '';
            communicationPreferencesStatus.classList.remove('is-error');
        }
        const state = await window.LuxePush.getState();
        const result = state.subscribed
            ? await window.LuxePush.unsubscribe()
            : await window.LuxePush.subscribe();
        if (communicationPreferencesStatus) {
            communicationPreferencesStatus.textContent = result.error
                ? result.error.message || 'Could not update browser push.'
                : state.subscribed ? 'Browser push alerts disabled.' : 'Browser push alerts enabled.';
            communicationPreferencesStatus.classList.toggle('is-error', !!result.error);
        }
        await refreshBrowserPushState();
    });

    window.LuxePush?.syncExisting().finally(refreshBrowserPushState);

    function setWhatsAppStatus(message, state = '') {
        if (verificationText) verificationText.textContent = message;
        if (verificationStatus) {
            verificationStatus.classList.toggle('is-verified', state === 'verified');
            verificationStatus.classList.toggle('is-error', state === 'error');
        }
    }

    function refreshWhatsAppStatus() {
        const normalizedInput = window.LuxeWhatsApp?.normalizePhone(
            profilePhone?.value,
            commerceSettings.whatsappDefaultCountryCode,
        );
        if (verifiedWhatsAppPhone && normalizedInput === verifiedWhatsAppPhone) {
            setWhatsAppStatus(`Verified: ${verifiedWhatsAppPhone}`, 'verified');
            if (requestCodeButton) requestCodeButton.innerHTML = '<i class="fab fa-whatsapp"></i> Change verified number';
        } else if (verifiedWhatsAppPhone) {
            setWhatsAppStatus('The new number must be verified before it replaces your current number.');
            if (requestCodeButton) requestCodeButton.innerHTML = '<i class="fab fa-whatsapp"></i> Verify new number';
        } else {
            setWhatsAppStatus('Not verified');
        }
        if (verificationNote) {
            verificationNote.textContent = commerceSettings.whatsappVerificationRequired
                ? 'A verified WhatsApp number is required before checkout.'
                : 'Verification can be completed now and will be required when secure WhatsApp checkout is enabled.';
        }
    }

    refreshWhatsAppStatus();
    profilePhone?.addEventListener('input', refreshWhatsAppStatus);

    requestCodeButton?.addEventListener('click', async () => {
        const phone = profilePhone?.value.trim() || '';
        if (!window.LuxeWhatsApp?.normalizePhone(phone, commerceSettings.whatsappDefaultCountryCode)) {
            setWhatsAppStatus('Enter a valid WhatsApp number with its country code.', 'error');
            return;
        }
        requestCodeButton.disabled = true;
        requestCodeButton.textContent = 'Sending…';
        const { data, error } = await window.LuxeWhatsApp.requestCode(phone);
        requestCodeButton.disabled = false;
        if (error || data?.error) {
            setWhatsAppStatus(whatsappVerificationMessage(data?.error, error), 'error');
            refreshWhatsAppButton(requestCodeButton, verifiedWhatsAppPhone);
            return;
        }
        if (data?.alreadyVerified) {
            verifiedWhatsAppPhone = data.phone;
            if (profilePhone) profilePhone.value = data.phone;
            refreshWhatsAppStatus();
            refreshCommunicationPreferences();
            return;
        }
        if (codePanel) codePanel.hidden = false;
        setWhatsAppStatus('Code sent. It expires in 10 minutes.');
        codeInput?.focus();
        refreshWhatsAppButton(requestCodeButton, verifiedWhatsAppPhone);
    });

    verifyCodeButton?.addEventListener('click', async () => {
        const code = codeInput?.value.trim() || '';
        const phone = profilePhone?.value.trim() || '';
        if (!/^\d{6}$/.test(code)) {
            setWhatsAppStatus('Enter the 6-digit code from WhatsApp.', 'error');
            return;
        }
        verifyCodeButton.disabled = true;
        verifyCodeButton.textContent = 'Verifying…';
        const { data, error } = await window.LuxeWhatsApp.verifyCode(phone, code);
        verifyCodeButton.disabled = false;
        verifyCodeButton.textContent = 'Verify';
        if (error || data?.error) {
            setWhatsAppStatus(whatsappVerificationMessage(data?.error, error), 'error');
            return;
        }
        verifiedWhatsAppPhone = data.phone;
        if (profilePhone) profilePhone.value = data.phone;
        if (codePanel) codePanel.hidden = true;
        if (codeInput) codeInput.value = '';
        refreshWhatsAppStatus();
        refreshCommunicationPreferences();
    });

    const profileForm = document.getElementById('profileForm');
    if (profileForm) {
        profileForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = profileForm.querySelector('button[type="submit"]');
            if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }

            const { error } = await window.LuxeProfile.update(user.id, {
                full_name: profileFullName ? profileFullName.value.trim() : ''
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
            window.syncStorefrontNavigation?.();

            alert('Profile updated!');
        });
    }

    communicationPreferencesForm?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const button = communicationPreferencesForm.querySelector('button[type="submit"]');
        if (button) { button.disabled = true; button.textContent = 'Saving...'; }
        if (communicationPreferencesStatus) {
            communicationPreferencesStatus.textContent = '';
            communicationPreferencesStatus.classList.remove('is-error');
        }
        const { data, error } = await window.LuxeProfile.updateCommunicationPreferences(
            !!emailUpdatesPreference?.checked,
            !!whatsappUpdatesPreference?.checked,
        );
        if (button) { button.disabled = false; button.textContent = 'Save Preferences'; }
        if (error) {
            if (communicationPreferencesStatus) {
                communicationPreferencesStatus.textContent = error.message || 'Preferences could not be saved.';
                communicationPreferencesStatus.classList.add('is-error');
            }
            return;
        }
        if (communicationPreferencesStatus) {
            communicationPreferencesStatus.textContent = 'Communication preferences saved.';
        }
        if (emailUpdatesPreference) emailUpdatesPreference.checked = !!data?.emailUpdates;
        if (whatsappUpdatesPreference) whatsappUpdatesPreference.checked = !!data?.whatsappUpdates;
    });

    // ---------------- Orders panel ----------------
    const ordersList = document.getElementById('ordersList');
    if (ordersList && window.LuxeOrders) {
        const orders = await ordersRequest;

        if (!orders || orders.length === 0) {
            ordersList.innerHTML = `
                <div class="orders-empty">
                    <i class="fas fa-box-open"></i>
                    <p>You haven't placed any orders yet.</p>
                </div>
            `;
        } else {
            ordersList.innerHTML = orders.map(order => renderOrderCard(order)).join('');
            const requestedOrder = String(returnParams.get('order') || '').trim().toLowerCase();
            if (requestedOrder) {
                const targetOrder = [...ordersList.querySelectorAll('.order-card')].find(
                    card => card.dataset.orderNumber?.toLowerCase() === requestedOrder,
                );
                if (targetOrder) {
                    targetOrder.classList.add('is-focused-order');
                    requestAnimationFrame(() => targetOrder.scrollIntoView({ behavior: 'smooth', block: 'start' }));
                    window.setTimeout(() => targetOrder.classList.remove('is-focused-order'), 3600);
                }
            }
        }
    }

    // ---------------- Notifications panel ----------------
    const notificationsList = document.getElementById('notificationsList');
    async function loadNotifications(request = window.LuxeNotifications?.getAll()) {
        if (!notificationsList || !window.LuxeNotifications) return;
        const { data, error } = await request;
        if (error) {
            notificationsList.innerHTML = '<div class="orders-empty"><i class="fas fa-exclamation-circle"></i><p>Could not load notifications.</p></div>';
            return;
        }
        setNotificationBadge(data.filter(item => !item.read_at).length);
        if (!data.length) {
            notificationsList.innerHTML = '<div class="orders-empty"><i class="fas fa-bell-slash"></i><p>No notifications yet.</p></div>';
            return;
        }
        notificationsList.innerHTML = data.map(item => `
            <article class="dashboard-notification ${item.read_at ? '' : 'is-unread'}" data-id="${escapeDashboardHtml(item.id)}">
                <span class="notification-kind"><i class="fas ${item.kind === 'order' ? 'fa-box' : item.kind === 'welcome' ? 'fa-star' : 'fa-bullhorn'}"></i></span>
                <div><h3>${escapeDashboardHtml(item.title)}</h3><p>${escapeDashboardHtml(item.message)}</p><time>${new Date(item.created_at).toLocaleString()}</time></div>
            </article>
        `).join('');
    }
    document.getElementById('markAllNotificationsRead')?.addEventListener('click', async () => {
        await window.LuxeNotifications.markAllRead();
        setNotificationBadge(0);
        window.updateNavbarNotificationBadge?.(0, true);
        document.querySelectorAll('.dashboard-notification.is-unread').forEach(item => item.classList.remove('is-unread'));
    });
    await loadNotifications(notificationsRequest);

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
            <img src="${escapeDashboardHtml(safeHttpUrl(item.image_url) || 'https://via.placeholder.com/48')}" alt="${escapeDashboardHtml(item.product_name)}">
            <span class="item-name">${escapeDashboardHtml(item.product_name)}</span>
            <span class="item-qty">x${item.quantity}</span>
            <span class="item-price">$${Number(item.price).toFixed(2)}</span>
        </div>
    `).join('');

    const eta = order.estimated_delivery_min_days
        ? `${order.estimated_delivery_min_days}${order.estimated_delivery_max_days && order.estimated_delivery_max_days !== order.estimated_delivery_min_days ? `–${order.estimated_delivery_max_days}` : ''} days`
        : 'To be confirmed';

    const allowedStatuses = ['pending_confirmation', 'awaiting_payment', 'processing', 'confirmed', 'shipped', 'delivered', 'cancelled'];
    const safeStatus = allowedStatuses.includes(order.status) ? order.status : 'processing';

    return `
        <div class="order-card" data-order-number="${escapeDashboardHtml(order.order_number)}">
            <div class="order-card-header">
                <div>
                    <div class="order-number">${escapeDashboardHtml(order.order_number)}</div>
                    <div class="order-date">${date}</div>
                </div>
                <span class="order-status ${safeStatus}">${escapeDashboardHtml(safeStatus.replaceAll('_', ' '))}</span>
            </div>
            <div class="order-card-body">
                ${itemsHtml}
            </div>
            <div class="order-card-footer">
                <span>ETA: ${eta}${safeHttpUrl(order.waybill_url) ? ` · <a href="${escapeDashboardHtml(safeHttpUrl(order.waybill_url))}" target="_blank" rel="noopener">Track parcel</a>` : ''}${Number(order.discount_amount || 0) > 0 ? ` · Promo ${escapeDashboardHtml(order.promotion_code || '')} saved $${Number(order.discount_amount).toFixed(2)}` : ''}</span>
                <strong>Total: $${Number(order.total).toFixed(2)}</strong>
            </div>
        </div>
    `;
}

function setNotificationBadge(count) {
    const badge = document.getElementById('notificationBadge');
    if (!badge) return;
    badge.textContent = count > 99 ? '99+' : String(count);
    badge.hidden = count < 1;
}

function safeHttpUrl(value) {
    try {
        const url = new URL(value);
        return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
    } catch { return ''; }
}

function refreshWhatsAppButton(button, verifiedPhone) {
    if (!button) return;
    button.innerHTML = verifiedPhone
        ? '<i class="fab fa-whatsapp"></i> Change verified number'
        : '<i class="fab fa-whatsapp"></i> Send verification code';
}

function whatsappVerificationMessage(code, error) {
    const messages = {
        verification_not_configured: `WhatsApp verification has not been enabled by ${window.LuxeBrand?.name || 'ALKEBULAN'} yet.`,
        invalid_phone: 'Enter a valid WhatsApp number with its country code.',
        number_unavailable: 'That WhatsApp number is already linked to another account.',
        too_many_requests: 'Too many codes were requested. Please try again later.',
        resend_too_soon: 'Please wait a minute before requesting another code.',
        message_not_sent: 'WhatsApp could not deliver the code. Check the number and try again.',
        invalid_code: 'Enter the complete 6-digit code.',
        invalid_or_expired_code: 'That code is incorrect or expired. Request a new one.',
        authentication_required: 'Please sign in again before verifying your number.',
    };
    return messages[code] || error?.message || 'WhatsApp verification could not be completed.';
}

function escapeDashboardHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
}
