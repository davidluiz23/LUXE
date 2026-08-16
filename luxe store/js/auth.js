// js/auth.js - Authentication Logic

document.addEventListener('DOMContentLoaded', () => {
    // Hide loader
    const loader = document.getElementById('loader');
    if (loader) {
        setTimeout(() => {
            loader.style.display = 'none';
        }, 300);
    }

    // Pending registration temp storage
    let pendingUser = null;

    // Sign Up Form
    const signupForm = document.getElementById('signupForm');
    const otpModal = document.getElementById('otpModal');
    const otpForm = document.getElementById('otpForm');
    const otpDigits = document.querySelectorAll('.otp-digit');

    if (signupForm) {
        signupForm.addEventListener('submit', (e) => {
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

            // Validation
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

            // Simple password hashing helper for client storage
            const hashPassword = (str) => {
                let hash = 0;
                for (let i = 0; i < str.length; i++) {
                    const char = str.charCodeAt(i);
                    hash = (hash << 5) - hash + char;
                    hash |= 0;
                }
                return 'hx_' + Math.abs(hash).toString(16);
            };

            // Generate 6-digit random code
            const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();

            pendingUser = {
                fullName,
                email,
                passwordHash: hashPassword(password),
                password: password, // Retained for local comparison
                otp: generatedOtp,
                createdAt: new Date().toISOString()
            };

            // Trigger Supabase Auth Email OTP confirmation if configured
            if (typeof window.supabase === 'object' && window.supabase && window.isSupabaseConfigured && window.isSupabaseConfigured()) {
                window.supabase.auth.signUp({
                    email: email,
                    password: password,
                    options: {
                        data: { full_name: fullName }
                    }
                }).then(({ data, error }) => {
                    if (error) console.warn('Supabase Auth signUp note:', error.message);
                }).catch(e => console.warn(e));
            }

            // Display modal & update target email and code
            const targetEmail = document.getElementById('verifyEmailTarget');
            const demoCode = document.getElementById('demoCodeDisplay');
            if (targetEmail) targetEmail.textContent = email;
            if (demoCode) demoCode.textContent = generatedOtp;

            if (otpModal) {
                otpModal.classList.add('active');
                if (otpDigits.length > 0) otpDigits[0].focus();
            }
        });
    }

    // OTP Digit auto-advance logic
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

    // Close OTP Modal
    const closeOtpBtn = document.getElementById('closeOtpModal');
    if (closeOtpBtn && otpModal) {
        closeOtpBtn.addEventListener('click', () => {
            otpModal.classList.remove('active');
        });
    }

    // OTP Form Verification Submit
    if (otpForm) {
        otpForm.addEventListener('submit', (e) => {
            e.preventDefault();
            
            let enteredOtp = '';
            otpDigits.forEach(input => enteredOtp += input.value.trim());

            if (!pendingUser) {
                showAuthError('Session expired. Please try signing up again.');
                if (otpModal) otpModal.classList.remove('active');
                return;
            }

            // If entered OTP matches generated code OR Supabase verification
            const isMatch = (enteredOtp === pendingUser.otp);
            
            if (!isMatch) {
                // Try verifying Supabase email token if applicable
                if (typeof window.supabase === 'object' && window.supabase && window.isSupabaseConfigured && window.isSupabaseConfigured()) {
                    window.supabase.auth.verifyOtp({
                        email: pendingUser.email,
                        token: enteredOtp,
                        type: 'signup'
                    }).then(({ data, error }) => {
                        if (error) {
                            alert('Invalid verification code. Please check the code sent to your email or the demo box.');
                            return;
                        }
                        completeRegistration();
                    }).catch(() => {
                        alert('Invalid verification code! Please enter the correct 6-digit code.');
                    });
                    return;
                }
                alert('Invalid verification code! Please enter the correct code shown in the demo box.');
                return;
            }

            completeRegistration();

            function completeRegistration() {
                delete pendingUser.otp;
                pendingUser.verified = true;
                
                // Save to current active user and persistent users registry
                localStorage.setItem('luxe_user', JSON.stringify(pendingUser));
                
                const usersRegistry = JSON.parse(localStorage.getItem('luxe_users_registry') || '{}');
                usersRegistry[pendingUser.email.toLowerCase()] = pendingUser;
                localStorage.setItem('luxe_users_registry', JSON.stringify(usersRegistry));
                
                // Save verified user account to Supabase Cloud DB if available
                if (typeof window.LuxeCloudDB === 'object' && window.LuxeCloudDB.saveUserProfile) {
                    window.LuxeCloudDB.saveUserProfile(pendingUser);
                }
                
                if (otpModal) otpModal.classList.remove('active');
                
                showAuthSuccess('Account verified & created successfully! Redirecting to login...');
                
                setTimeout(() => {
                    window.location.href = 'login.html';
                }, 1500);
            }
        });
    }

    // Resend OTP Link
    const resendBtn = document.getElementById('resendOtpBtn');
    if (resendBtn) {
        resendBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (pendingUser) {
                const newOtp = Math.floor(100000 + Math.random() * 900000).toString();
                pendingUser.otp = newOtp;
                const demoCode = document.getElementById('demoCodeDisplay');
                if (demoCode) demoCode.textContent = newOtp;
                alert(`New verification code sent: ${newOtp}`);
            }
    // Passwordless Magic Link / Email OTP Login Handler
    const magicLinkBtn = document.getElementById('sendMagicLinkBtn');
    if (magicLinkBtn) {
        magicLinkBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            const emailEl = document.getElementById('loginEmail');
            const email = emailEl ? emailEl.value.trim() : '';

            if (!email) {
                showAuthError('Please enter your email address to receive a Magic Link / OTP.');
                return;
            }

            if (typeof window.supabase === 'object' && window.supabase && window.isSupabaseConfigured && window.isSupabaseConfigured()) {
                try {
                    const { data, error } = await window.supabase.auth.signInWithOtp({
                        email: email,
                        options: {
                            shouldCreateUser: false,
                            emailRedirectTo: window.location.origin + '/dashboard.html'
                        }
                    });

                    if (error) {
                        showAuthError(error.message);
                    } else {
                        showAuthSuccess('✨ Magic Link / OTP sent! Please check your email inbox.');
                    }
                } catch(err) {
                    showAuthError('Failed to send Magic Link. Please try again.');
                }
            } else {
                showAuthSuccess('✨ Demo Magic Link code sent! Please check your email inbox.');
            }
        });
    }

    // Login Form
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

            // Check if user exists in active user, users registry, or Cloud DB
            let user = null;
            const usersRegistry = JSON.parse(localStorage.getItem('luxe_users_registry') || '{}');
            const registryUser = usersRegistry[email.toLowerCase()];
            const storedUser = localStorage.getItem('luxe_user');
            
            if (registryUser) {
                user = registryUser;
            } else if (storedUser) {
                const parsed = JSON.parse(storedUser);
                if (parsed.email.toLowerCase() === email.toLowerCase()) {
                    user = parsed;
                }
            }

            // Cloud DB Fallback lookup if available
            if (!user && typeof window.LuxeCloudDB === 'object' && window.LuxeCloudDB.getUserProfile) {
                try {
                    const cloudProfile = await window.LuxeCloudDB.getUserProfile(email);
                    if (cloudProfile) {
                        user = {
                            fullName: cloudProfile.fullName,
                            email: cloudProfile.email,
                            password: password,
                            phone: cloudProfile.phone,
                            avatar: cloudProfile.avatar,
                            verified: true
                        };
                    }
                } catch(e) {}
            }

            if (!user) {
                showAuthError('No account found with this email. Please sign up first.');
                return;
            }

            if (password !== user.password) {
                showAuthError('Invalid email or password');
                return;
            }

            // Restore complete user object (including avatar and profile details) to luxe_user session
            localStorage.setItem('luxe_user', JSON.stringify(user));
            localStorage.setItem('luxe_logged_in', 'true');
            
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

    // Check login status for user icon
    const isLoggedIn = localStorage.getItem('luxe_logged_in') === 'true';
    const userIcons = document.querySelectorAll('.user-icon');
    userIcons.forEach(userIcon => {
        if (isLoggedIn) {
            userIcon.innerHTML = '<i class="fas fa-user-check"></i>';
            userIcon.title = 'My Dashboard';
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