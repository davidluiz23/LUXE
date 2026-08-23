// Payment provider registry. WhatsApp ordering is live; Paystack can be
// enabled later without changing checkout or ever handling raw card data.
(function initLuxePayments() {
  const defaults = {
    adminWhatsApp: "2348103463852",
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

  const override = window.LUXE_PAYMENT_OVERRIDES || {};
  const config = {
    ...defaults,
    ...override,
    providers: { ...defaults.providers, ...(override.providers || {}) },
  };

  async function begin(provider, order) {
    if (provider === "whatsapp") return { ok: true, mode: "whatsapp" };
    if (provider === "paystack" && config.providers.paystack.enabled) {
      const { data, error } = await window.LuxePayments.initialize(order.id);
      if (error || !data?.authorizationUrl) {
        return { ok: false, error: error?.message || data?.error || "Could not start payment." };
      }
      return { ok: true, mode: "redirect", authorizationUrl: data.authorizationUrl };
    }
    return { ok: false, error: "That payment option is not available yet." };
  }

  window.LuxePaymentConfig = config;
  window.LuxePaymentProviders = { begin };
})();
