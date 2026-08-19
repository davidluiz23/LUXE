// js/verify-signup.js
// Step 2 of deferred signup:
// verify the emailed token -> choose password -> create Auth account -> sign in.

document.addEventListener("DOMContentLoaded", async () => {
  const loader = document.getElementById("loader");
  const checking = document.getElementById("signupTokenChecking");
  const invalid = document.getElementById("signupTokenInvalid");
  const verified = document.getElementById("signupTokenVerified");
  const created = document.getElementById("signupCreatedState");
  const form = document.getElementById("finishSignupForm");
  const errorBox = document.getElementById("finishSignupError");

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

  const token =
    new URLSearchParams(window.location.search)
      .get("token")
      ?.trim() || "";

  function showInvalid() {
    if (checking) checking.style.display = "none";
    if (verified) verified.style.display = "none";
    if (created) created.style.display = "none";
    if (invalid) invalid.style.display = "block";
  }

  function showError(message) {
    if (!errorBox) return;
    errorBox.textContent = message;
    errorBox.style.display = "block";
  }

  if (
    !token ||
    !window.LuxeAuth ||
    !window.LuxeAuth.isReady()
  ) {
    showInvalid();
    return;
  }

  const { data: tokenState, error: tokenError } =
    await window.LuxeAuth.checkSignupToken(token);

  if (tokenError || !tokenState?.valid) {
    showInvalid();
    return;
  }

  if (checking) checking.style.display = "none";
  if (verified) verified.style.display = "block";

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (errorBox) errorBox.style.display = "none";

    const password =
      document.getElementById("signupPassword")?.value || "";
    const confirmPassword =
      document.getElementById("signupConfirmPassword")?.value || "";
    const button =
      document.getElementById("finishSignupBtn");

    if (password.length < 8) {
      showError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      showError("Passwords do not match.");
      return;
    }

    if (button) {
      button.disabled = true;
      button.textContent = "Creating account...";
    }

    const { data, error } =
      await window.LuxeAuth.completeSignup(token, password);

    if (error || !data?.ok || !data?.email) {
      if (button) {
        button.disabled = false;
        button.textContent = "Finish Account Creation";
      }

      showError(
        error?.message ||
          data?.error ||
          "Could not create your account. The link may have expired."
      );
      return;
    }

    // The account now exists and is already email-confirmed.
    // Sign in with the password the user just chose.
    const { data: signInData, error: signInError } =
      await window.LuxeAuth.signInWithPassword(
        data.email,
        password
      );

    if (signInError || !signInData?.user) {
      if (verified) verified.style.display = "none";
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
          signInData.user.user_metadata?.full_name ||
          data.fullName ||
          "",
      })
    );
    localStorage.setItem("luxe_logged_in", "true");

    if (verified) verified.style.display = "none";
    if (created) created.style.display = "block";

    setTimeout(() => {
      window.location.href = "index.html";
    }, 1200);
  });
});
