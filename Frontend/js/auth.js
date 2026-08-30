// js/auth.js - ALKEBULAN authentication UI
//
// Deferred signup uses a Brevo email with both a secure link and a six-digit code.
// The Auth account is created only after either verification path succeeds.

document.addEventListener("DOMContentLoaded", () => {
  const loader = document.getElementById("loader");

  if (loader) {
    setTimeout(() => {
      loader.style.display = "none";
    }, 300);
  }

  function cacheSession(user) {
    if (user) {
      localStorage.setItem(
        "luxe_user",
        JSON.stringify({
          id: user.id,
          email: user.email,
          fullName: user.user_metadata?.full_name || "",
        }),
      );
      localStorage.setItem("luxe_logged_in", "true");
    } else {
      localStorage.removeItem("luxe_user");
      localStorage.removeItem("luxe_logged_in");
    }

    updateHeaderUserIcon(!!user);
  }

  if (window.LuxeAuth && window.LuxeAuth.isReady()) {
    window.LuxeAuth.getCurrentUser().then(cacheSession);
    window.LuxeAuth.onAuthStateChange((user) => cacheSession(user));
  }

  const query = new URLSearchParams(window.location.search);

  if (query.get("verified") === "true") {
    showAuthSuccess("Email verified successfully. You can now sign in.");

    query.delete("verified");

    const remaining = query.toString();
    const cleanUrl =
      window.location.pathname +
      (remaining ? `?${remaining}` : "") +
      window.location.hash;

    window.history.replaceState({}, "", cleanUrl);
  }

  const signupForm = document.getElementById("signupForm");
  const signupCaptcha = document.getElementById("signupCaptcha");
  const turnstileSiteKey = String(window.LuxeBrand?.turnstileSiteKey || "").trim();
  let signupCaptchaToken = "";
  let signupCaptchaWidgetId = null;

  if (signupForm && signupCaptcha && turnstileSiteKey) {
    signupCaptcha.hidden = false;
    const renderCaptcha = () => {
      if (!window.turnstile || signupCaptchaWidgetId !== null) return;
      signupCaptchaWidgetId = window.turnstile.render(signupCaptcha, {
        sitekey: turnstileSiteKey,
        theme: "light",
        size: "flexible",
        callback(token) {
          signupCaptchaToken = token;
        },
        "expired-callback"() {
          signupCaptchaToken = "";
        },
        "error-callback"() {
          signupCaptchaToken = "";
        },
      });
    };

    if (window.turnstile) {
      renderCaptcha();
    } else {
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.addEventListener("load", renderCaptcha, { once: true });
      script.addEventListener("error", () => {
        showAuthError("The signup security check could not load. Please refresh and try again.");
      }, { once: true });
      document.head.appendChild(script);
    }
  }

  if (signupForm) {
    signupForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      const fullName = document.getElementById("fullName")?.value.trim() || "";
      const email = document.getElementById("email")?.value.trim() || "";
      const terms = document.getElementById("terms")?.checked || false;

      if (!fullName || !email) {
        showAuthError("Please fill in all fields.");
        return;
      }

      if (!terms) {
        showAuthError("Please agree to the Terms of Service.");
        return;
      }

      if (turnstileSiteKey && !signupCaptchaToken) {
        showAuthError("Please complete the signup security check.");
        return;
      }

      if (!window.LuxeAuth || !window.LuxeAuth.isReady()) {
        showAuthError(
          "Account service is unavailable right now. Please try again later.",
        );
        return;
      }

      const submitButton = signupForm.querySelector('button[type="submit"]');

      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = "Sending verification...";
      }

      const { error } = await window.LuxeAuth.requestSignupVerification(
        fullName,
        email,
        signupCaptchaToken || null,
      );

      if (signupCaptchaWidgetId !== null && window.turnstile) {
        window.turnstile.reset(signupCaptchaWidgetId);
        signupCaptchaToken = "";
      }

      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = "Send Verification Code";
      }

      if (error) {
        showAuthError(
          error.message || "Could not create account. Please try again.",
        );
        return;
      }

      showAuthSuccess("Verification email sent. Enter the six-digit code to continue.");

      sessionStorage.setItem("luxe_pending_signup_email", email);
      signupForm.reset();

      setTimeout(() => {
        window.location.href = "verify-signup.html";
      }, 900);
    });
  }

  const magicLinkButton = document.getElementById("sendMagicLinkBtn");
  const googleSignInButton = document.getElementById("googleSignInBtn");

  if (googleSignInButton) {
    googleSignInButton.addEventListener("click", async () => {
      if (!window.LuxeAuth || !window.LuxeAuth.isReady()) {
        showAuthError("Account service is unavailable right now.");
        return;
      }

      const label = googleSignInButton.querySelector("span");
      googleSignInButton.disabled = true;
      googleSignInButton.classList.add("is-loading");
      if (label) label.textContent = "Connecting to Google...";

      const { error } = await window.LuxeAuth.signInWithGoogle(query.get("returnTo"));

      if (error) {
        googleSignInButton.disabled = false;
        googleSignInButton.classList.remove("is-loading");
        if (label) label.textContent = "Continue with Google";
        showAuthError(
          error.message || "Google sign-in could not be started. Please try again.",
        );
      }
    });
  }

  if (magicLinkButton) {
    magicLinkButton.addEventListener("click", async (event) => {
      event.preventDefault();

      const email = document.getElementById("loginEmail")?.value.trim() || "";

      if (!email) {
        showAuthError(
          "Please enter your email address to receive a sign-in link.",
        );
        return;
      }

      if (!window.LuxeAuth || !window.LuxeAuth.isReady()) {
        showAuthError("Account service is unavailable right now.");
        return;
      }

      const originalHtml = magicLinkButton.innerHTML;

      magicLinkButton.disabled = true;
      magicLinkButton.textContent = "Sending...";

      const { error } = await window.LuxeAuth.signInWithMagicLink(email, query.get("returnTo"));

      magicLinkButton.disabled = false;
      magicLinkButton.innerHTML = originalHtml;

      if (error) {
        showAuthError(error.message || "Could not send sign-in link.");
        return;
      }

      showAuthSuccess(
        "If a verified account exists for that email, a sign-in link has been sent.",
      );
    });
  }

  const forgotLink = document.getElementById("forgotPasswordLink");
  const forgotModal = document.getElementById("forgotPasswordModal");
  const forgotForm = document.getElementById("forgotPasswordForm");
  const forgotSuccess = document.getElementById("forgotPasswordSuccess");
  const forgotError = document.getElementById("forgotPasswordError");
  const closeForgotButton = document.getElementById("closeForgotModal");
  let forgotModalReturnFocus = null;

  const closeForgotModal = () => {
    if (!forgotModal?.classList.contains("active")) return;
    forgotModal.classList.remove("active");
    forgotModal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("auth-modal-open");
    if (forgotModalReturnFocus instanceof HTMLElement) forgotModalReturnFocus.focus();
  };

  if (forgotLink && forgotModal) {
    forgotLink.addEventListener("click", (event) => {
      event.preventDefault();

      const loginEmail = document.getElementById("loginEmail");
      const forgotEmail = document.getElementById("forgotEmail");

      if (loginEmail && forgotEmail && loginEmail.value.trim()) {
        forgotEmail.value = loginEmail.value.trim();
      }

      if (forgotForm) forgotForm.style.display = "block";
      if (forgotSuccess) forgotSuccess.style.display = "none";
      if (forgotError) {
        forgotError.textContent = "";
        forgotError.style.display = "none";
      }

      forgotModalReturnFocus = document.activeElement;
      forgotModal.classList.add("active");
      forgotModal.setAttribute("aria-hidden", "false");
      document.body.classList.add("auth-modal-open");
      window.setTimeout(() => (forgotEmail || closeForgotButton)?.focus(), 0);
    });
  }

  if (closeForgotButton && forgotModal) {
    closeForgotButton.addEventListener("click", closeForgotModal);
    forgotModal.addEventListener("click", (event) => {
      if (event.target === forgotModal) closeForgotModal();
    });
    document.addEventListener("keydown", (event) => {
      if (!forgotModal.classList.contains("active")) return;
      if (event.key === "Escape") {
        event.preventDefault();
        closeForgotModal();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(forgotModal.querySelectorAll('button, input, a[href]'))
        .filter((element) => !element.hidden && !element.disabled && element.offsetParent !== null);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
  }

  if (forgotForm) {
    forgotForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      const email = document.getElementById("forgotEmail")?.value.trim() || "";

      if (!email) return;

      if (!window.LuxeAuth || !window.LuxeAuth.isReady()) {
        alert("Account service is unavailable right now.");
        return;
      }

      const button = document.getElementById("sendResetBtn");

      if (button) {
        button.disabled = true;
        button.textContent = "Sending...";
      }

      if (forgotError) {
        forgotError.textContent = "";
        forgotError.style.display = "none";
      }

      const { error } = await window.LuxeAuth.requestPasswordReset(
        email,
        "customer",
      );

      if (button) {
        button.disabled = false;
        button.textContent = "Send Reset Link";
      }

      if (error) {
        console.warn("[ALKEBULAN] Password reset request:", error.message);
        if (forgotError) {
          forgotError.textContent =
            "We couldn't request a reset email right now. Please try again.";
          forgotError.style.display = "block";
        }
        return;
      }

      forgotForm.style.display = "none";

      if (forgotSuccess) {
        forgotSuccess.style.display = "block";
      }
    });
  }

  const loginForm = document.getElementById("loginForm");

  if (loginForm) {
    loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      const email = document.getElementById("loginEmail")?.value.trim() || "";
      const password = document.getElementById("loginPassword")?.value || "";

      if (!email || !password) {
        showAuthError("Please fill in all fields.");
        return;
      }

      if (!window.LuxeAuth || !window.LuxeAuth.isReady()) {
        showAuthError("Account service is unavailable right now.");
        return;
      }

      const submitButton = document.getElementById("standardLoginBtn");

      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = "Signing in...";
      }

      const { data, error } = await window.LuxeAuth.signInWithPassword(
        email,
        password,
      );

      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = "Sign In";
      }

      if (error) {
        showAuthError(
          error.code === "user_banned"
            ? `This account is currently suspended. Contact ${window.LuxeBrand?.name || "ALKEBULAN"} customer care for assistance.`
            : error.message || "Invalid email or password.",
        );
        return;
      }

      if (data?.user) {
        cacheSession(data.user);
      }

      showAuthSuccess("Welcome back! Redirecting...");

      setTimeout(() => {
        const returnTo = query.get("returnTo");
        window.location.href = returnTo === "checkout.html" ? returnTo : "index.html";
      }, 1000);
    });
  }

  document.querySelectorAll(".toggle-password").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      const wrapper = button.closest(".password-input-wrapper");
      const input = wrapper?.querySelector("input");
      const icon = button.querySelector("i");

      if (!input || !icon) return;

      if (input.type === "password") {
        input.type = "text";
        icon.className = "fas fa-eye-slash";
        button.setAttribute("aria-label", "Hide password");
      } else {
        input.type = "password";
        icon.className = "fas fa-eye";
        button.setAttribute("aria-label", "Show password");
      }
    });
  });

  updateHeaderUserIcon(localStorage.getItem("luxe_logged_in") === "true");
});

function updateHeaderUserIcon(isLoggedIn) {
  document.querySelectorAll(".user-icon").forEach((userIcon) => {
    if (isLoggedIn) {
      userIcon.title = "My Account";
      userIcon.href = "dashboard.html";
    } else {
      userIcon.title = "Sign In";
      userIcon.href = "login.html";
    }
  });
}

function showAuthError(message) {
  removeExistingAuthMessage();

  const element = document.createElement("div");
  element.className = "auth-message error";
  element.style.cssText = `
    background:#E74C3C;
    color:white;
    padding:12px 16px;
    border-radius:8px;
    margin-bottom:20px;
    font-weight:500;
  `;
  element.textContent = message;

  insertAuthMessage(element);
  setTimeout(() => element.remove(), 6000);
}

function showAuthSuccess(message) {
  removeExistingAuthMessage();

  const element = document.createElement("div");
  element.className = "auth-message success";
  element.style.cssText = `
    background:#27AE60;
    color:white;
    padding:12px 16px;
    border-radius:8px;
    margin-bottom:20px;
    font-weight:500;
  `;
  element.textContent = message;

  insertAuthMessage(element);
  setTimeout(() => element.remove(), 8000);
}

function removeExistingAuthMessage() {
  const existing = document.querySelector(".auth-message");

  if (existing) existing.remove();
}

function insertAuthMessage(element) {
  const form = document.querySelector(".auth-form");

  if (form) {
    form.insertBefore(element, form.firstChild);
    return;
  }

  const wrapper = document.querySelector(".auth-form-wrapper");

  if (wrapper) {
    wrapper.insertBefore(element, wrapper.firstChild);
  }
}
