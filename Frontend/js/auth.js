// js/auth.js - LUXE authentication UI
//
// Signup uses Supabase email CONFIRMATION LINKS, not six-digit signup OTPs.

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

  async function initializeAuthState() {
    if (!window.LuxeAuth || !window.LuxeAuth.isReady()) return;

    const user = await window.LuxeAuth.getCurrentUser();
    cacheSession(user);

    window.LuxeAuth.onAuthStateChange((nextUser) => {
      cacheSession(nextUser);
    });
  }

  initializeAuthState();

  // ---------------------------------------------------------------
  // EMAIL CONFIRMATION REDIRECT FEEDBACK
  // ---------------------------------------------------------------

  const query = new URLSearchParams(window.location.search);

  if (query.get("verified") === "true") {
    showAuthSuccess("Email verified successfully. You can now sign in.");

    // Remove the marker without reloading so refreshing does not show
    // the same message forever.
    query.delete("verified");
    const cleanQuery = query.toString();
    const cleanUrl =
      window.location.pathname +
      (cleanQuery ? `?${cleanQuery}` : "") +
      window.location.hash;

    window.history.replaceState({}, "", cleanUrl);
  }

  // ---------------------------------------------------------------
  // SIGN UP
  // ---------------------------------------------------------------

  const signupForm = document.getElementById("signupForm");

  if (signupForm) {
    signupForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      const fullName = document.getElementById("fullName")?.value.trim() || "";
      const email = document.getElementById("email")?.value.trim() || "";
      const password = document.getElementById("password")?.value || "";
      const confirmPassword =
        document.getElementById("confirmPassword")?.value || "";
      const terms = document.getElementById("terms")?.checked || false;

      if (!fullName || !email || !password || !confirmPassword) {
        showAuthError("Please fill in all fields.");
        return;
      }

      if (password.length < 8) {
        showAuthError("Password must be at least 8 characters.");
        return;
      }

      if (password !== confirmPassword) {
        showAuthError("Passwords do not match.");
        return;
      }

      if (!terms) {
        showAuthError("Please agree to the Terms of Service.");
        return;
      }

      if (!window.LuxeAuth || !window.LuxeAuth.isReady()) {
        showAuthError("Account service is unavailable right now.");
        return;
      }

      const submitButton = signupForm.querySelector('button[type="submit"]');

      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = "Creating account...";
      }

      const { error } = await window.LuxeAuth.signUp(
        email,
        password,
        fullName,
      );

      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = "Create Account";
      }

      if (error) {
        showAuthError(error.message || "Could not create account.");
        return;
      }

      showAuthSuccess(
        "Account created. Check your email and click the confirmation link to verify your account.",
      );

      signupForm.reset();
    });
  }

  // ---------------------------------------------------------------
  // OPTIONAL RESEND CONFIRMATION BUTTON
  //
  // If you later add a button with id="resendConfirmationBtn" and an
  // email input with id="email", this works automatically.
  // ---------------------------------------------------------------

  const resendConfirmationButton = document.getElementById(
    "resendConfirmationBtn",
  );

  if (resendConfirmationButton) {
    resendConfirmationButton.addEventListener("click", async (event) => {
      event.preventDefault();

      const email = document.getElementById("email")?.value.trim() || "";

      if (!email) {
        showAuthError("Enter your email address first.");
        return;
      }

      const { error } =
        await window.LuxeAuth.resendSignupConfirmation(email);

      if (error) {
        showAuthError(error.message || "Could not resend confirmation email.");
        return;
      }

      showAuthSuccess("A new confirmation link has been sent.");
    });
  }

  // ---------------------------------------------------------------
  // MAGIC-LINK LOGIN
  // ---------------------------------------------------------------

  const magicLinkButton = document.getElementById("sendMagicLinkBtn");

  if (magicLinkButton) {
    magicLinkButton.addEventListener("click", async (event) => {
      event.preventDefault();

      const email =
        document.getElementById("loginEmail")?.value.trim() || "";

      if (!email) {
        showAuthError("Enter your email address first.");
        return;
      }

      if (!window.LuxeAuth || !window.LuxeAuth.isReady()) {
        showAuthError("Account service is unavailable right now.");
        return;
      }

      magicLinkButton.disabled = true;

      const originalHtml = magicLinkButton.innerHTML;
      magicLinkButton.textContent = "Sending...";

      const { error } = await window.LuxeAuth.signInWithMagicLink(email);

      magicLinkButton.disabled = false;
      magicLinkButton.innerHTML = originalHtml;

      if (error) {
        showAuthError(error.message || "Could not send sign-in link.");
        return;
      }

      showAuthSuccess("Sign-in link sent. Check your email.");
    });
  }

  // ---------------------------------------------------------------
  // PASSWORD LOGIN
  // ---------------------------------------------------------------

  const loginForm = document.getElementById("loginForm");

  if (loginForm) {
    loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      const email =
        document.getElementById("loginEmail")?.value.trim() || "";
      const password =
        document.getElementById("loginPassword")?.value || "";

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
        showAuthError(error.message || "Invalid email or password.");
        return;
      }

      if (data?.user) {
        cacheSession(data.user);
      }

      showAuthSuccess("Welcome back! Redirecting...");

      setTimeout(() => {
        window.location.href = "index.html";
      }, 1000);
    });
  }

  // ---------------------------------------------------------------
  // PASSWORD VISIBILITY
  // ---------------------------------------------------------------

  document.querySelectorAll(".toggle-password").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();

      const wrapper = button.closest(".password-input-wrapper");
      const input = wrapper?.querySelector("input");
      const icon = button.querySelector("i");

      if (!input || !icon) return;

      if (input.type === "password") {
        input.type = "text";
        icon.className = "fas fa-eye-slash";
      } else {
        input.type = "password";
        icon.className = "fas fa-eye";
      }
    });
  });

  // Initial icon state while Supabase session lookup runs.
  updateHeaderUserIcon(
    localStorage.getItem("luxe_logged_in") === "true",
  );
});

function updateHeaderUserIcon(isLoggedIn) {
  document.querySelectorAll(".user-icon").forEach((userIcon) => {
    if (isLoggedIn) {
      userIcon.innerHTML = '<i class="fas fa-user-check"></i>';
      userIcon.title = "My Account";
      userIcon.href = "dashboard.html";
    } else {
      userIcon.innerHTML = '<i class="fas fa-user"></i>';
      userIcon.title = "Sign Up";
      userIcon.href = "signup.html";
    }
  });
}

function showAuthError(message) {
  const existing = document.querySelector(".auth-message");
  if (existing) existing.remove();

  const messageElement = document.createElement("div");
  messageElement.className = "auth-message error";
  messageElement.style.cssText = `
    background: #E74C3C;
    color: white;
    padding: 12px 16px;
    border-radius: 8px;
    margin-bottom: 20px;
    font-weight: 500;
  `;
  messageElement.textContent = message;

  const form = document.querySelector(".auth-form");

  if (form) {
    form.insertBefore(messageElement, form.firstChild);
  }

  setTimeout(() => messageElement.remove(), 6000);
}

function showAuthSuccess(message) {
  const existing = document.querySelector(".auth-message");
  if (existing) existing.remove();

  const messageElement = document.createElement("div");
  messageElement.className = "auth-message success";
  messageElement.style.cssText = `
    background: #27AE60;
    color: white;
    padding: 12px 16px;
    border-radius: 8px;
    margin-bottom: 20px;
    font-weight: 500;
  `;
  messageElement.textContent = message;

  const form = document.querySelector(".auth-form");

  if (form) {
    form.insertBefore(messageElement, form.firstChild);
  }

  setTimeout(() => messageElement.remove(), 8000);
}
