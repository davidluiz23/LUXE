// Payment provider registry. WhatsApp ordering is live; Paystack can be
// enabled later without changing checkout or ever handling raw card data.
(function initLuxePayments() {
  const defaults = {
    adminWhatsApp: null,
    activeProvider: "whatsapp",
    providers: {
      whatsapp: { enabled: true, label: "Order via WhatsApp" },
      paystack: {
        enabled: false,
        label: "Pay securely online",
        description: "Card, bank, USSD and transfer through Paystack",
      },
    },
  };

  const isRecord = (value) => !!value && typeof value === "object" && !Array.isArray(value);
  const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const normalizeAdminWhatsApp = (value) => {
    const digits = String(value || "").replace(/\D/g, "");
    return /^[1-9]\d{6,14}$/.test(digits) ? digits : null;
  };
  const mergeProvider = (base, next) => {
    if (!isRecord(next)) return { ...base };
    const merged = { ...base, ...next };
    if (typeof next.enabled !== "boolean") merged.enabled = base.enabled;
    return merged;
  };
  const mergeProviders = (base, next) => ({
    whatsapp: mergeProvider(base.whatsapp, next?.whatsapp),
    paystack: mergeProvider(base.paystack, next?.paystack),
  });

  const override = isRecord(window.LUXE_PAYMENT_OVERRIDES)
    ? window.LUXE_PAYMENT_OVERRIDES
    : {};
  const config = {
    ...defaults,
    ...override,
    adminWhatsApp: normalizeAdminWhatsApp(override.adminWhatsApp),
    providers: mergeProviders(defaults.providers, override.providers),
  };

  function applyRemoteConfig(value, source) {
    const remote = isRecord(value?.paymentConfig) ? value.paymentConfig : value;
    if (!isRecord(remote)) return false;

    const adminKey = hasOwn(remote, "adminWhatsApp")
      ? "adminWhatsApp"
      : hasOwn(remote, "whatsappAdminNumber") ? "whatsappAdminNumber" : null;
    const recognized = adminKey || hasOwn(remote, "activeProvider") || hasOwn(remote, "providers");
    if (!recognized) return false;

    if (adminKey) {
      const normalized = normalizeAdminWhatsApp(remote[adminKey]);
      if (remote[adminKey] && !normalized) {
        console.warn(`[ALKEBULAN] Ignoring an invalid admin WhatsApp number from ${source}.`);
      }
      // An explicit null/invalid backend value disables the stale fallback rather
      // than risking an order being routed to the wrong recipient.
      config.adminWhatsApp = normalized;
    }
    if (typeof remote.activeProvider === "string") {
      config.activeProvider = remote.activeProvider.trim().toLowerCase();
    }
    if (isRecord(remote.providers)) {
      config.providers = mergeProviders(config.providers, remote.providers);
    }
    return true;
  }

  async function withTimeout(promise, label, timeoutMs = 5000) {
    let timeoutId;
    try {
      return await Promise.race([
        promise,
        new Promise((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error(`${label} timed out.`)), timeoutMs);
        }),
      ]);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async function loadRemoteConfig() {
    const commerceRequest = typeof window.LuxeCommerce?.getSettings === "function"
      ? withTimeout(Promise.resolve().then(() => window.LuxeCommerce.getSettings()), "Commerce settings")
      : Promise.resolve(null);
    const backendRequest = typeof window.LuxePayments?.request === "function"
      ? withTimeout(Promise.resolve().then(() => window.LuxePayments.request("config")), "Payment settings")
      : Promise.resolve(null);
    const [commerceResult, backendResult] = await Promise.allSettled([
      commerceRequest,
      backendRequest,
    ]);

    if (commerceResult.status === "fulfilled") {
      applyRemoteConfig(commerceResult.value, "commerce settings");
    } else {
      console.warn("[ALKEBULAN] Commerce settings are unavailable; using the payment fallback.", commerceResult.reason);
    }

    if (backendResult.status === "fulfilled" && !backendResult.value?.error) {
      // The payment gateway is authoritative because it reads the same backend
      // settings used for server-side order notifications.
      applyRemoteConfig(backendResult.value?.data, "payment gateway");
    } else if (backendResult.status === "fulfilled") {
      console.warn(
        "[ALKEBULAN] Payment settings are unavailable; using the payment fallback.",
        backendResult.value?.error?.message || backendResult.value?.error,
      );
    } else if (backendResult.status === "rejected") {
      console.warn("[ALKEBULAN] Payment settings are unavailable; using the payment fallback.", backendResult.reason);
    }

    config.providers.whatsapp.enabled = Boolean(
      config.providers.whatsapp.enabled && config.adminWhatsApp,
    );
    if (!config.providers[config.activeProvider]?.enabled) {
      config.activeProvider = ["whatsapp", "paystack"]
        .find((provider) => config.providers[provider]?.enabled) || null;
    }
    return config;
  }

  const ready = loadRemoteConfig().catch((error) => {
    console.warn("[ALKEBULAN] Payment configuration could not be refreshed.", error);
    config.providers.whatsapp.enabled = Boolean(
      config.providers.whatsapp.enabled && config.adminWhatsApp,
    );
    return config;
  });

  async function begin(provider, order) {
    await ready;
    if (provider === "whatsapp" && config.providers.whatsapp.enabled && config.adminWhatsApp) {
      return { ok: true, mode: "whatsapp" };
    }
    if (provider === "paystack" && config.providers.paystack.enabled) {
      if (!order?.id || typeof window.LuxePayments?.initialize !== "function") {
        return { ok: false, error: "Secure payments are temporarily unavailable." };
      }
      try {
        const { data, error } = await window.LuxePayments.initialize(order.id);
        if (error || !data?.authorizationUrl) {
          return { ok: false, error: error?.message || data?.error || "Could not start payment." };
        }
        return { ok: true, mode: "redirect", authorizationUrl: data.authorizationUrl };
      } catch (error) {
        console.warn("[ALKEBULAN] Payment initialization failed:", error);
        return { ok: false, error: "Could not start payment. Please try again." };
      }
    }
    return { ok: false, error: "That payment option is not available yet." };
  }

  window.LuxePaymentConfig = config;
  window.LuxePaymentConfigReady = ready;
  window.LuxePaymentProviders = { begin };
})();
