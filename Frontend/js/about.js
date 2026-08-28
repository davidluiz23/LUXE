// Live, aggregate storefront facts for the About page.
(function initializeAboutMetrics() {
  "use strict";

  const metricElements = () =>
    Array.from(document.querySelectorAll("[data-store-metric]"));

  function catalogFallback() {
    const products = typeof window.getProducts === "function"
      ? window.getProducts() || []
      : window.products || [];
    const available = products.filter((product) => product.inStock !== false);
    return {
      availablePieces: available.length,
      designersCurated: new Set(
        available.map((product) => String(product.brand || "").trim().toLocaleLowerCase()).filter(Boolean),
      ).size,
      collections: new Set(
        available.map((product) => String(product.category || "").trim().toLocaleLowerCase()).filter(Boolean),
      ).size,
      deliveredOrders: null,
    };
  }

  function render(metrics) {
    metricElements().forEach((element) => {
      const value = metrics?.[element.dataset.storeMetric];
      element.textContent = value !== null && value !== undefined && Number.isFinite(Number(value))
        ? Number(value).toLocaleString()
        : "—";
    });
  }

  document.addEventListener("DOMContentLoaded", async () => {
    if (window.productsReady) {
      try { await window.productsReady; } catch (_) { /* Use bundled catalog fallback. */ }
    }

    let metrics = catalogFallback();
    if (window.LuxeMetrics?.getPublic) {
      const { data, error } = await window.LuxeMetrics.getPublic();
      if (!error && data) metrics = { ...metrics, ...data };
    }
    render(metrics);
  });
})();
