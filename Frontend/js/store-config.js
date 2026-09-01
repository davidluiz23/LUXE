// Public storefront switches only. The payment gateway is authoritative for the
// admin WhatsApp destination; never duplicate that operational number here.
window.LUXE_PAYMENT_OVERRIDES = {
  adminWhatsApp: null,
  activeProvider: "whatsapp",
  providers: {
    whatsapp: { enabled: true },
    paystack: { enabled: false },
  },
};

