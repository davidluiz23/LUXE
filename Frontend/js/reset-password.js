// js/reset-password.js
// Handles both customer and admin recovery links.
// The recovery token is consumed by Supabase automatically through
// detectSessionInUrl: true in supabase-client.js.

document.addEventListener("DOMContentLoaded", async () => {
  const loader = document.getElementById("loader");
  if (loader) {
    setTimeout(() => {
      loader.style.display = "none";
    }, 300);
  }

  const query = new URLSearchParams(window.location.search);
  const portal =
    query.get("portal") === "admin" ? "admin" : "customer";

  document.querySelectorAll(".toggle-password").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();

      const wrapper = button.closest(".password-input-wrapper");
      if (!wrapper) return;

      const input = wrapper.querySelector("input");
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

  const form = document.getElementById("resetPasswordForm");
  const invalidState = document.getElementById("resetInvalidState");
  const subtitle = document.getElementById("resetSubtitle");

  if (!window.LuxeAuth || !window.LuxeAuth.isReady()) {
    if (form) form.style.display = "none";
    if (subtitle) {
      subtitle.textContent =
        "Account service is unavailable right now.";
    }
    return;
  }

  const user = await window.LuxeAuth.getCurrentUser();

  if (!user) {
    if (form) form.style.display = "none";
    if (invalidState) invalidState.style.display = "block";
    return;
  }

  if (subtitle && portal === "admin") {
    subtitle.textContent =
      "Choose a new password for your administrator account.";
  }

  function showResetFormError(message) {
    const errorText = document.getElementById("resetFormError");
    const subtitleEl = document.getElementById("resetSubtitle");
    if (errorText) {
      errorText.textContent = message;
      errorText.style.display = "block";
    } else if (subtitleEl) {
      subtitleEl.textContent = message;
      subtitleEl.style.color = "#C0392B";
    }
  }

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const newPassword =
      document.getElementById("newPassword")?.value || "";
    const confirmPassword =
      document.getElementById("confirmNewPassword")?.value || "";

    if (newPassword.length < 8) {
      showResetFormError("Password must be at least 8 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      showResetFormError("Passwords do not match.");
      return;
    }

    const button =
      document.getElementById("updatePasswordBtn");

    if (button) {
      button.disabled = true;
      button.textContent = "Updating...";
    }

    const { error } =
      await window.LuxeAuth.updatePassword(newPassword);

    if (button) {
      button.disabled = false;
      button.textContent = "Update Password";
    }

    if (error) {
      showResetFormError("Could not update password: " + error.message);
      return;
    }

    if (subtitle) {
      subtitle.textContent =
        portal === "admin"
          ? "Password updated! Redirecting to Admin Sign In..."
          : "Password updated! Redirecting you to sign in...";
    }

    if (form) form.style.display = "none";

    // End the recovery session so both portals require a fresh login
    // with the newly chosen password.
    await window.LuxeAuth.signOut();

    setTimeout(() => {
      window.location.href =
        portal === "admin" ? "admin.html" : "index.html";
    }, 1800);
  });
});
