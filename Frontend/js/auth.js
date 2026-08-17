// js/auth.js - Authentication Logic
// Talks to Supabase (via js/supabase-client.js) for real accounts.
// No passwords are ever stored in localStorage anymore — localStorage
// only holds a small "display cache" (name/email) so the rest of the
// site (cart.js, wishlist.js) can keep working exactly as before.

document.addEventListener('DOMContentLoaded', () => {
    // Hide loader
    const loader = document.getElementById('loader');
    if (loader) {
        setTimeout(() => {
            loader.style.display = 'none';
        }, 300);
    }

    // Email pending verification (set after signUp, used by the OTP step)
    let pendingEmail = null;

    // Keep the localStorage "display cache" in sync with the real
    // Supabase session so cart.js / wishlist.js / the header user-icon
    // keep working unchanged.
    function cacheSession(user) {
        if (user) {
            localStorage.setItem('luxe_user', JSON.stringify({
                id: user.id,
                email: user.email,
                fullName: (user.user_metadata && user.user_metadata.full_name) || ''
            }));
            localStorage.setItem('luxe_logged_in', 'true');
        } else {
            localStorage.removeItem('luxe_user');
            localStorage.removeItem('luxe_logged_in');
        }
    }

    if (window.LuxeAuth && window.LuxeAuth.isReady()) {
        window.LuxeAuth.getCurrentUser().then(cacheSession);
        window.LuxeAuth.onAuthStateChange(cacheSession);
    }

    // ===================================================================
    // SIGN UP
    // ===================================================================
    const signupForm = document.getElementById('signupForm');
    const otpModal = document.getElementById('otpModal');
    const otpForm = document.getElementById('otpForm');
    const otpDigits = document.querySelectorAll('.otp-digit');

    if (signupForm) {
        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const fullNameEl = document.getElementById('fullName');
            const emailEl = document.getElementById('email');
            const passwordEl = document.getElementById('password');
            const confirmPasswordEl = document.getElementById('confirmPassword');
            const termsEl = document.getElementById('terms');

            const fullName = fullNameEl ? fullNameEl.value.trim() : '';
            const email = emailEl ? emailEl.value.trim() : '';
            const password = passwordEl ? passwordEl.value : '';
            const confirmPassword = confirmPasswordEl ? confirmPasswordEl.value : '';
            const terms = termsEl ? termsEl.checked : false;

            if (!fullName || !email || !password || !confirmPassword) {
                showAuthError('Please fill in all fields');
                return;
            }
            if (password.length < 8) {
                showAuthError('Password must be at least 8 characters');
                return;
            }
            if (password !== confirmPassword) {
                showAuthError('Passwords do not match');
                return;
            }
            if (!terms) {
                showAuthError('Please agree to the Terms of Service');
                return;
            }
            if (!window.LuxeAuth || !window.LuxeAuth.isReady()) {
                showAuthError('Account service is unavailable right now. Please try again later.');
                return;
            }

            const submitBtn = signupForm.querySelector('button[type="submit"]');
            if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Creating account...'; }

            const { error } = await window.LuxeAuth.signUp(email, password, fullName);

            if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Create Account'; }

            if (error) {
                showAuthError(error.message || 'Could not create account. Please try again.');
                return;
            }

            pendingEmail = email;

            // Show the verification modal. We no longer display a fake
            // "demo code" — Supabase has emailed a real 6-digit code.
            const targetEmail = document.getElementById('verifyEmailTarget');
            if (targetEmail) targetEmail.textContent = email;
            const demoBanner = document.querySelector('.simulated-code-banner');
            if (demoBanner) demoBanner.style.display = 'none';

            if (otpModal) {
                otpModal.classList.add('active');
                if (otpDigits.length > 0) otpDigits[0].focus();
            }
        });
    }

    // OTP digit auto-advance
    otpDigits.forEach((digit, index) => {
        digit.addEventListener('input', (e) => {
            if (e.target.value.length === 1 && index < otpDigits.length - 1) {
                otpDigits[index + 1].focus();
            }
        });
        digit.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && !e.target.value && index > 0) {
                otpDigits[index - 1].focus();
            }
        });
    });

    const closeOtpBtn = document.getElementById('closeOtpModal');
    if (closeOtpBtn && otpModal) {
        closeOtpBtn.addEventListener('click', () => {
            otpModal.classList.remove('active');
        });
    }

    // OTP verification submit
    if (otpForm) {
        otpForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            let enteredOtp = '';
            otpDigits.forEach(input => enteredOtp += input.value.trim());

            if (!pendingEmail) {
                showAuthError('Session expired. Please try signing up again.');
                if (otpModal) otpModal.classList.remove('active');
                return;
            }
            if (enteredOtp.length !== 6) {
                alert('Please enter the full 6-digit code.');
                return;
            }

            const submitBtn = otpForm.querySelector('button[type="submit"]');
            if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Verifying...'; }

            const { data, error } = await window.LuxeAuth.verifySignupOtp(pendingEmail, enteredOtp);

            if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Verify Account'; }

            if (error) {
                alert('Invalid or expired code. Please check your email and try again, or resend the code.');
                return;
            }

            if (data && data.user) cacheSession(data.user);
            if (otpModal) otpModal.classList.remove('active');

            showAuthSuccess('Account verified & created successfully! Redirecting...');
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 1500);
        });
    }

    // Resend OTP
    const resendBtn = document.getElementById('resendOtpBtn');
    if (resendBtn) {
        resendBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            if (!pendingEmail) return;
            const { error } = await window.LuxeAuth.resendSignupOtp(pendingEmail);
            if (error) {
                alert('Could not resend the code: ' + error.message);
            } else {
                alert('A new verification code has been sent to ' + pendingEmail);
            }
        });
    }

    // ===================================================================
    // MAGIC LINK / OTP LOGIN
    // ===================================================================
    const magicLinkBtn = document.getElementById('sendMagicLinkBtn');
    if (magicLinkBtn) {
        magicLinkBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            const emailEl = document.getElementById('loginEmail');
            const email = emailEl ? emailEl.value.trim() : '';

            if (!email) {
                showAuthError('Please enter your email address to receive a Magic Link.');
                return;
            }
            if (!window.LuxeAuth || !window.LuxeAuth.isReady()) {
                showAuthError('Account service is unavailable right now.');
                return;
            }

            const { error } = await window.LuxeAuth.signInWithMagicLink(email);
            if (error) {
                showAuthError(error.message);
            } else {
                showAuthSuccess('✨ Magic Link sent! Please check your email inbox.');
            }
        });
    }

    // ===================================================================
    // LOGIN
    // ===================================================================
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const emailEl = document.getElementById('loginEmail');
            const passwordEl = document.getElementById('loginPassword');

            const email = emailEl ? emailEl.value.trim() : '';
            const password = passwordEl ? passwordEl.value : '';

            if (!email || !password) {
                showAuthError('Please fill in all fields');
                return;
            }
            if (!window.LuxeAuth || !window.LuxeAuth.isReady()) {
                showAuthError('Account service is unavailable right now.');
                return;
            }

            const submitBtn = document.getElementById('standardLoginBtn');
            if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Signing in...'; }

            const { data, error } = await window.LuxeAuth.signInWithPassword(email, password);

            if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Sign In'; }

            if (error) {
                showAuthError('Invalid email or password');
                return;
            }

            if (data && data.user) cacheSession(data.user);

            showAuthSuccess('Welcome back! Redirecting...');
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 1500);
        });
    }

    // Password toggle visibility
    document.querySelectorAll('.toggle-password').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
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

    // Check login status for the header user icon
    const isLoggedIn = localStorage.getItem('luxe_logged_in') === 'true';
    const userIcons = document.querySelectorAll('.user-icon');
    userIcons.forEach(userIcon => {
        if (isLoggedIn) {
            userIcon.innerHTML = '<i class="fas fa-user-check"></i>';
            userIcon.title = 'My Account';
            userIcon.href = 'dashboard.html';
        } else {
            userIcon.href = 'signup.html';
        }
    });
});

// Helper functions
function showAuthError(message) {
    const existing = document.querySelector('.auth-message');
    if (existing) existing.remove();

    const errorDiv = document.createElement('div');
    errorDiv.className = 'auth-message error';
    errorDiv.style.cssText = `
        background: #E74C3C;
        color: white;
        padding: 12px 16px;
        border-radius: 8px;
        margin-bottom: 20px;
        font-weight: 500;
    `;
    errorDiv.textContent = message;

    const form = document.querySelector('.auth-form');
    if (form) {
        form.insertBefore(errorDiv, form.firstChild);
    }

    setTimeout(() => errorDiv.remove(), 4000);
}

function showAuthSuccess(message) {
    const existing = document.querySelector('.auth-message');
    if (existing) existing.remove();

    const successDiv = document.createElement('div');
    successDiv.className = 'auth-message success';
    successDiv.style.cssText = `
        background: #27AE60;
        color: white;
        padding: 12px 16px;
        border-radius: 8px;
        margin-bottom: 20px;
        font-weight: 500;
    `;
    successDiv.textContent = message;

    const form = document.querySelector('.auth-form');
    if (form) {
        form.insertBefore(successDiv, form.firstChild);
    }
}
