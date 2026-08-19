// js/reset-password.js
// Powers reset-password.html — the page the "forgot password" email
// link lands on. Supabase reads the recovery token out of the URL
// automatically (detectSessionInUrl: true in supabase-client.js) and
// turns it into a temporary session, which is all updatePassword()
// needs to actually change the password.

document.addEventListener('DOMContentLoaded', async () => {
    const loader = document.getElementById('loader');
    if (loader) setTimeout(() => { loader.style.display = 'none'; }, 300);

    // Password show/hide toggles (shared markup/behaviour with login.html)
    document.querySelectorAll('.toggle-password').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const wrapper = btn.closest('.password-input-wrapper');
            if (!wrapper) return;
            const input = wrapper.querySelector('input');
            const icon = btn.querySelector('i');
            if (!input || !icon) return;
            if (input.type === 'password') {
                input.type = 'text';
                icon.className = 'fas fa-eye-slash';
            } else {
                input.type = 'password';
                icon.className = 'fas fa-eye';
            }
        });
    });

    const form = document.getElementById('resetPasswordForm');
    const invalidState = document.getElementById('resetInvalidState');
    const subtitle = document.getElementById('resetSubtitle');

    if (!window.LuxeAuth || !window.LuxeAuth.isReady()) {
        if (form) form.style.display = 'none';
        if (subtitle) subtitle.textContent = 'Account service is unavailable right now.';
        return;
    }

    // If someone opens this page without a valid recovery link, there's
    // no session — don't let them "update" a password with nothing to
    // attach it to.
    const user = await window.LuxeAuth.getCurrentUser();
    if (!user) {
        if (form) form.style.display = 'none';
        if (invalidState) invalidState.style.display = 'block';
        return;
    }

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const newPassword = document.getElementById('newPassword').value;
            const confirmPassword = document.getElementById('confirmNewPassword').value;

            if (newPassword.length < 8) {
                alert('Password must be at least 8 characters.');
                return;
            }
            if (newPassword !== confirmPassword) {
                alert('Passwords do not match.');
                return;
            }

            const btn = document.getElementById('updatePasswordBtn');
            if (btn) { btn.disabled = true; btn.textContent = 'Updating...'; }

            const { error } = await window.LuxeAuth.updatePassword(newPassword);

            if (btn) { btn.disabled = false; btn.textContent = 'Update Password'; }

            if (error) {
                alert('Could not update password: ' + error.message);
                return;
            }

            if (subtitle) subtitle.textContent = 'Password updated! Redirecting you to sign in...';
            form.style.display = 'none';
            setTimeout(() => { window.location.href = 'login.html'; }, 1800);
        });
    }
});
