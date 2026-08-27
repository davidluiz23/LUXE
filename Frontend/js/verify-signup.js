// js/verify-signup.js
// Step 2 of deferred signup:
// verify the emailed link or code -> choose password -> create Auth account.

document.addEventListener("DOMContentLoaded", async () => {
  const loader = document.getElementById("loader");
  const checking = document.getElementById("signupTokenChecking");
  const codeEntry = document.getElementById("signupCodeEntry");
  const codeForm = document.getElementById("signupCodeForm");
  const codeError = document.getElementById("signupCodeError");
  const invalid = document.getElementById("signupTokenInvalid");
  const verified = document.getElementById("signupTokenVerified");
  const created = document.getElementById("signupCreatedState");
  const form = document.getElementById("finishSignupForm");
  const errorBox = document.getElementById("finishSignupError");
  const query = new URLSearchParams(window.location.search);
  const token = query.get("token")?.trim() || "";

  let verifiedEmail = "";
  let verifiedCode = "";

  if (loader) {
    setTimeout(() => {
      loader.style.display = "none";
    }, 250);
  }

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

  function hideAllStates() {
    [checking, codeEntry, invalid, verified, created].forEach((element) => {
      if (element) element.style.display = "none";
    });
  }

  function showInvalid() {
    hideAllStates();
    if (invalid) invalid.style.display = "block";
  }

  function showVerified() {
    hideAllStates();
    if (verified) verified.style.display = "block";
  }

  function showError(element, message) {
    if (!element) return;
    element.textContent = message;
    element.style.display = "block";
  }

  if (!window.LuxeAuth || !window.LuxeAuth.isReady()) {
    showInvalid();
    return;
  }

  if (token) {
    const { data: tokenState, error: tokenError } =
      await window.LuxeAuth.checkSignupToken(token);

    if (tokenError || !tokenState?.valid) {
      showInvalid();
      return;
    }

    showVerified();
  } else {
    hideAllStates();
    if (codeEntry) codeEntry.style.display = "block";

    const savedEmail =
      sessionStorage.getItem("luxe_pending_signup_email") || "";
    const emailInput = document.getElementById("signupCodeEmail");
    if (emailInput) emailInput.value = savedEmail;
  }

  codeForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (codeError) codeError.style.display = "none";

    const email =
      document.getElementById("signupCodeEmail")?.value.trim().toLowerCase() ||
      "";
    const code =
      document.getElementById("signupVerificationCode")?.value.trim() || "";
    const button = document.getElementById("verifySignupCodeBtn");

    if (!/^\d{6}$/.test(code)) {
      showError(codeError, "Enter the six-digit code from your email.");
      return;
    }

    if (button) {
      button.disabled = true;
      button.textContent = "Verifying...";
    }

    const { data, error } = await window.LuxeAuth.checkSignupCode(email, code);

    if (button) {
      button.disabled = false;
      button.textContent = "Verify Email";
    }

    if (error || !data?.valid) {
      showError(
        codeError,
        "That code is invalid or expired. Request a new email if needed.",
      );
      return;
    }

    verifiedEmail = email;
    verifiedCode = code;
    showVerified();
  });

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (errorBox) errorBox.style.display = "none";

    const password =
      document.getElementById("signupPassword")?.value || "";
    const confirmPassword =
      document.getElementById("signupConfirmPassword")?.value || "";
    const button = document.getElementById("finishSignupBtn");

    if (password.length < 8) {
      showError(errorBox, "Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      showError(errorBox, "Passwords do not match.");
      return;
    }

    if (button) {
      button.disabled = true;
      button.textContent = "Creating account...";
    }

    const result = token
      ? await window.LuxeAuth.completeSignup(token, password)
      : await window.LuxeAuth.completeSignupWithCode(
          verifiedEmail,
          verifiedCode,
          password,
        );
    const { data, error } = result;

    if (error || !data?.ok || !data?.email) {
      if (button) {
        button.disabled = false;
        button.textContent = "Finish Account Creation";
      }

      showError(
        errorBox,
        error?.message ||
          data?.error ||
          "Could not create your account. Verification may have expired.",
      );
      return;
    }

    sessionStorage.removeItem("luxe_pending_signup_email");

    const { data: signInData, error: signInError } =
      await window.LuxeAuth.signInWithPassword(data.email, password);

    if (signInError || !signInData?.user) {
      hideAllStates();
      if (created) {
        created.style.display = "block";
        created.querySelector(".auth-subtitle").textContent =
          "Your account was created. Please sign in with your new password.";
      }

      setTimeout(() => {
        window.location.href = "login.html";
      }, 1800);
      return;
    }

    localStorage.setItem(
      "luxe_user",
      JSON.stringify({
        id: signInData.user.id,
        email: signInData.user.email,
        fullName:
          signInData.user.user_metadata?.full_name || data.fullName || "",
      }),
    );
    localStorage.setItem("luxe_logged_in", "true");

    hideAllStates();
    if (created) created.style.display = "block";

    setTimeout(() => {
      window.location.href = "index.html";
    }, 1200);
  });
});
