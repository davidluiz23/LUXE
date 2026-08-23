// Public storefront switches only. Never place Paystack or WhatsApp secrets here.
window.LUXE_PAYMENT_OVERRIDES = {
  adminWhatsApp: "2348103463852",
  activeProvider: "whatsapp",
  providers: {
    whatsapp: { enabled: true },
    paystack: { enabled: false },
  },
};

