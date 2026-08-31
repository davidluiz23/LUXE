// Completes browser-based OAuth redirects and sends the customer to a safe page.
document.addEventListener("DOMContentLoaded", async () => {
  const title = document.getElementById("oauthCallbackTitle");
  const status = document.getElementById("oauthCallbackStatus");
  const spinner = document.getElementById("oauthCallbackSpinner");
  const action = document.getElementById("oauthCallbackAction");
  const query = new URLSearchParams(window.location.search);
  const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const returnTo = query.get("returnTo") === "checkout.html"
    ? "checkout.html"
    : "index.html";
  const oauthError =
    query.get("error_description") ||
    fragment.get("error_description") ||
    query.get("error") ||
    fragment.get("error");

  const showError = (message) => {
    if (spinner) spinner.hidden = true;
    if (title) title.textContent = "Google sign-in was not completed";
    if (status) status.textContent = message;
    if (action) action.hidden = false;
  };

  if (oauthError) {
    showError(String(oauthError));
    return;
  }

  if (!window.LuxeAuth?.isReady()) {
    showError("The account service is unavailable right now. Please try again.");
    return;
  }

  const session = await window.LuxeAuth.getSession();

  if (!session?.user) {
    showError("We could not verify a Google session. Please return to sign in and try again.");
    return;
  }

  if (status) status.textContent = "You’re signed in. Redirecting…";
  window.setTimeout(() => {
    window.location.replace(returnTo);
  }, 450);
});
