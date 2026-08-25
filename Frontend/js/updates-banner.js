// js/updates-banner.js
//
// Shows the latest active row from the `site_updates` table (posted
// from the admin panel) as a small dismissible banner at the top of
// the page. Fails silently if Supabase isn't configured or there's
// no active update — never blocks page rendering.

document.addEventListener('DOMContentLoaded', async () => {
    if (!window.LuxeUpdates || !window.isSupabaseConfigured || !window.isSupabaseConfigured()) return;

    // Don't nag people who already dismissed today's update.
    const seenKey = 'luxe_dismissed_update';

    try {
        const updates = await window.LuxeUpdates.getActive();
        if (!updates || !updates.length) return;
        const update = updates[0];

        if (localStorage.getItem(seenKey) === update.id) return;

        const banner = document.createElement('div');
        banner.id = 'luxeUpdateBanner';
        banner.style.cssText = `
            position: relative;
            background: #111111;
            color: #fff;
            text-align: center;
            padding: 10px 44px 10px 16px;
            font-family: 'Poppins', sans-serif;
            font-size: 0.85rem;
            z-index: 1100;
        `;
        banner.innerHTML = `
            <strong style="color:#D4AF37;">${escapeHtmlBanner(update.title)}</strong>
            <span style="margin-left:8px;">${escapeHtmlBanner(update.message)}</span>
            <button aria-label="Dismiss" id="luxeUpdateBannerClose" style="
                position:absolute; right:10px; top:50%; transform:translateY(-50%);
                background:none; border:none; color:#fff; opacity:0.7; cursor:pointer; font-size:1rem;
            ">&times;</button>
        `;
        document.body.prepend(banner);

        document.getElementById('luxeUpdateBannerClose').addEventListener('click', () => {
            localStorage.setItem(seenKey, update.id);
            banner.remove();
        });
    } catch (e) {
        // Silent — a broken banner should never break the storefront.
        console.warn('ALKEBULAN: could not load site update banner', e);
    }
});

function escapeHtmlBanner(str) {
    return String(str || '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}
