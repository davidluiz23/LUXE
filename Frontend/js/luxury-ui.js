// Shared ALKEBULAN presentation enhancements.
// Commerce, authentication, catalog, and checkout logic remain in their existing modules.
(function initializeLuxuryUi() {
  "use strict";

  const page = (window.location.pathname.split("/").pop() || "index.html")
    .replace(/\.html$/i, "") || "index";
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const brandMark = (className = "brand-mark") => `
    <svg class="${className}" viewBox="0 0 72 72" aria-hidden="true" focusable="false">
      <path d="M27 7h18l16 22-17 6c1.6-2.4 2.5-5.3 2.5-8.4C46.5 17.9 41.8 12 36 12s-10.5 5.9-10.5 14.6c0 3.1.9 6 2.5 8.4l-17-6L27 7Z"/>
      <ellipse cx="36" cy="27" rx="9.2" ry="11.5"/>
      <path d="m34 38-5 27H6l8-22 20-5Zm4 0 20 5 8 22H43l-5-27Z"/>
    </svg>`;

  function pageLabel() {
    const labels = {
      index: "Contemporary luxury / Lagos",
      shop: "The complete collection",
      men: "Menswear / Current edit",
      women: "Womenswear / Current edit",
      product: "Selected piece / Details",
      cart: "Your selection",
      checkout: "Secure checkout",
      wishlist: "Saved pieces",
      dashboard: "Private account",
      login: "Private account",
      signup: "Private account",
      "reset-password": "Private account",
      "verify-signup": "Private account",
      about: "The house / Our story",
      contact: "Client services",
      faq: "Client services",
      shipping: "Client services",
      returns: "Client services",
      privacy: "Legal / Privacy",
    };
    return labels[page] || "ALKEBULAN / 2026";
  }

  function enhanceLoader() {
    const loader = $("#loader");
    if (!loader) return;
    loader.setAttribute("aria-label", "Loading ALKEBULAN");
    loader.innerHTML = `
      <div class="luxury-loader-lockup">
        ${brandMark("luxury-loader-mark")}
        <span>ALKEBULAN</span>
        <i aria-hidden="true"></i>
      </div>`;
  }

  function enhanceNavigation() {
    const header = $("#navbar");
    const logo = $(".logo a", header || document);
    const navList = $(".nav-links ul", header || document);
    const navIcons = $(".nav-icons", header || document);
    const mobileMenu = $("#mobileMenu", header || document);
    if (!header || !logo || !navList || !navIcons) return;

    header.classList.add("luxury-navbar");
    logo.setAttribute("aria-label", "ALKEBULAN home");
    logo.innerHTML = `${brandMark()}<span>ALKEBULAN</span>`;

    const navRoutes = [
      ["New arrivals", "shop.html?sort=newest", "new"],
      ["Shop", "shop.html", "shop"],
      ["Men", "men.html", "men"],
      ["Women", "women.html", "women"],
      ["Our story", "about.html", "about"],
    ];
    const newestIsActive = page === "shop" && new URLSearchParams(window.location.search).get("sort") === "newest";
    navList.innerHTML = navRoutes.map(([label, href, route]) => {
      const active = route === "new"
        ? newestIsActive
        : page === route && !(route === "shop" && newestIsActive);
      return `<li><a href="${href}"${active ? ' class="active"' : ""}>${label}</a></li>`;
    }).join("");

    const iconLabels = [
      [".search-icon", "Search"],
      [".wishlist-icon", "Saved pieces"],
      [".cart-icon", "Shopping bag"],
      [".user-icon", "Your account"],
    ];
    iconLabels.forEach(([selector, label]) => {
      const anchor = $(selector, navIcons);
      if (anchor) anchor.setAttribute("aria-label", label);
    });

    const hamburger = $("#hamburger", navIcons);
    const mobileViewport = window.matchMedia("(max-width: 720px)");
    if (hamburger) {
      hamburger.setAttribute("role", "button");
      hamburger.setAttribute("tabindex", "0");
      hamburger.setAttribute("aria-label", "Open menu");
      hamburger.setAttribute("aria-expanded", "false");
      const openWithKeyboard = (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        hamburger.click();
      };
      hamburger.addEventListener("keydown", openWithKeyboard);
    }

    if (mobileMenu) {
      const mobileList = $("ul", mobileMenu);
      const mobileClose = $("#mobileClose", mobileMenu);
      mobileMenu.setAttribute("role", "dialog");
      mobileMenu.setAttribute("aria-modal", "true");
      mobileMenu.setAttribute("aria-label", "Site navigation");

      const closeMobileMenu = ({ restoreFocus = false } = {}) => {
        mobileMenu.classList.remove("active");
        document.body.classList.remove("mobile-nav-open");
        hamburger?.classList.remove("is-active");
        hamburger?.setAttribute("aria-expanded", "false");
        mobileMenu.setAttribute("aria-hidden", "true");
        if (restoreFocus && mobileViewport.matches) hamburger?.focus();
      };

      const syncMobileMenu = () => {
        const isOpen = mobileMenu.classList.contains("active") && mobileViewport.matches;
        if (!mobileViewport.matches && mobileMenu.classList.contains("active")) {
          closeMobileMenu();
          return;
        }
        document.body.classList.toggle("mobile-nav-open", isOpen);
        hamburger?.classList.toggle("is-active", isOpen);
        hamburger?.setAttribute("aria-expanded", String(isOpen));
        mobileMenu.setAttribute("aria-hidden", String(!isOpen));
      };

      const menuObserver = new MutationObserver(syncMobileMenu);
      menuObserver.observe(mobileMenu, { attributes: true, attributeFilter: ["class"] });
      hamburger?.addEventListener("click", () => requestAnimationFrame(() => {
        syncMobileMenu();
        if (mobileMenu.classList.contains("active")) mobileClose?.focus();
      }));

      if (mobileClose) {
        mobileClose.setAttribute("role", "button");
        mobileClose.setAttribute("tabindex", "0");
        mobileClose.setAttribute("aria-label", "Close menu");
        mobileClose.addEventListener("click", () => requestAnimationFrame(() => closeMobileMenu({ restoreFocus: true })));
        mobileClose.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") mobileClose.click();
        });
      }
      if (mobileList) {
        mobileList.innerHTML = [
          ["01", "New arrivals", "shop.html?sort=newest"],
          ["02", "Shop all", "shop.html"],
          ["03", "Men", "men.html"],
          ["04", "Women", "women.html"],
          ["05", "Our story", "about.html"],
          ["06", "Client services", "contact.html"],
          ["07", "Account", "dashboard.html"],
        ].map(([number, label, href]) => `<li><a href="${href}"><small>${number}</small><span>${label}</span></a></li>`).join("");
        mobileList.insertAdjacentHTML("beforebegin", `<div class="mobile-brand-lockup">${brandMark()}<span>ALKEBULAN</span></div>`);
        mobileList.insertAdjacentHTML("afterend", `<div class="mobile-menu-meta"><span>Lagos / NG</span><a href="contact.html">Client services</a></div>`);
        mobileList.addEventListener("click", (event) => {
          if (event.target.closest("a")) closeMobileMenu();
        });
      }

      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && mobileMenu.classList.contains("active")) {
          closeMobileMenu({ restoreFocus: true });
        }
      });
      document.addEventListener("click", (event) => {
        if (!mobileMenu.classList.contains("active")) return;
        if (mobileMenu.contains(event.target) || hamburger?.contains(event.target)) return;
        closeMobileMenu();
      });
      mobileViewport.addEventListener("change", syncMobileMenu);
      syncMobileMenu();
    }

    const progress = document.createElement("span");
    progress.className = "nav-scroll-progress";
    progress.setAttribute("aria-hidden", "true");
    header.appendChild(progress);
    const updateProgress = () => {
      const available = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      progress.style.transform = `scaleX(${Math.min(1, window.scrollY / available)})`;
    };
    updateProgress();
    window.addEventListener("scroll", updateProgress, { passive: true });
  }

  function enhanceHeadings() {
    const intro = $(".page-header .container, .wishlist-header, .cart-section .container > .section-title, .checkout-title, .dashboard-section .container > h1");
    if (intro && !$(".page-kicker", intro.parentElement || document)) {
      const kicker = document.createElement("p");
      kicker.className = "page-kicker";
      kicker.textContent = pageLabel();
      if (intro.matches("h1, h2")) intro.insertAdjacentElement("beforebegin", kicker);
      else intro.insertAdjacentElement("afterbegin", kicker);
    }

    $$(".section-title").forEach((title, index) => {
      if (title.dataset.luxuryTitle) return;
      title.dataset.luxuryTitle = "true";
      title.dataset.index = String(index + 1).padStart(2, "0");
    });
  }

  function catalog() {
    if (typeof window.getProducts === "function") return window.getProducts() || [];
    return window.products || [];
  }

  function enhanceProductCards() {
    const products = catalog();
    $$(".product-card").forEach((card, index) => {
      if (card.dataset.luxuryCard) return;
      card.dataset.luxuryCard = "true";
      card.style.setProperty("--card-order", index);
      const id = Number(card.dataset.id);
      const product = products.find((item) => Number(item.id) === id);
      const imageWrap = $(".product-image", card);
      const info = $(".product-info", card);
      if (imageWrap && product?.hoverImage && !$(".luxury-secondary-image", imageWrap)) {
        const secondary = document.createElement("img");
        secondary.className = "luxury-secondary-image";
        secondary.src = product.hoverImage;
        secondary.alt = "";
        secondary.loading = "lazy";
        secondary.decoding = "async";
        imageWrap.appendChild(secondary);
      }
      if (imageWrap && !$(".luxury-card-status", imageWrap)) {
        const status = document.createElement("span");
        status.className = `luxury-card-status${product?.inStock === false ? " is-sold" : ""}`;
        status.textContent = product?.inStock === false ? "Sold out" : "Available";
        imageWrap.appendChild(status);
      }
      if (info && !$(".luxury-card-meta", info)) {
        const meta = document.createElement("div");
        meta.className = "luxury-card-meta";
        meta.innerHTML = `<span>ALK-${String(id || index + 1).padStart(4, "0")}</span><span>View piece</span>`;
        info.appendChild(meta);
      }
      $$("button", card).forEach((button) => {
        if (!button.type) button.type = "button";
        if (!button.getAttribute("aria-label")) {
          if (button.classList.contains("wishlist-btn")) button.setAttribute("aria-label", "Save piece");
          if (button.classList.contains("quick-view")) button.setAttribute("aria-label", "View piece");
        }
      });
    });
  }

  function enhanceEmptyStates() {
    const selectors = [".empty-cart", ".empty-wishlist", ".checkout-empty"];
    selectors.forEach((selector) => {
      $$(selector).forEach((state) => {
        if (state.dataset.luxuryEmpty) return;
        state.dataset.luxuryEmpty = "true";
        state.insertAdjacentHTML("afterbegin", `${brandMark("empty-state-mark")}<span class="empty-state-label">ALKEBULAN / Nothing selected</span>`);
      });
    });
  }

  function rebuildFooter() {
    const footer = $("footer");
    if (!footer) return;
    footer.classList.add("luxury-footer");
    footer.innerHTML = `
      <div class="container luxury-footer-top">
        <a href="index.html" class="footer-brand" aria-label="ALKEBULAN home">${brandMark()}<span>ALKEBULAN</span></a>
        <p>Contemporary clothing selected with intention.<br>For a quieter kind of confidence.</p>
        <a class="footer-contact-link" href="contact.html">Speak with client services <span aria-hidden="true">↗</span></a>
      </div>
      <div class="container luxury-footer-grid">
        <div><span class="footer-label">Collection</span><a href="shop.html?sort=newest">New arrivals</a><a href="men.html">Men</a><a href="women.html">Women</a><a href="shop.html">Shop all</a></div>
        <div><span class="footer-label">The house</span><a href="about.html">Our story</a><a href="wishlist.html">Saved pieces</a><a href="dashboard.html">My account</a><a href="contact.html">Contact</a></div>
        <div><span class="footer-label">Client services</span><a href="shipping.html">Shipping</a><a href="returns.html">Returns</a><a href="faq.html">FAQ</a><a href="privacy.html">Privacy</a></div>
        <div class="footer-location"><span class="footer-label">Location</span><strong>Lagos, Nigeria</strong><a href="tel:+2348103463852">+234 810 346 3852</a><a href="mailto:hello@alkebulan.com">hello@alkebulan.com</a></div>
      </div>
      <div class="container luxury-footer-bottom"><span>© 2026 ALKEBULAN</span><span>Secure commerce / Worldwide delivery</span><a href="#top" class="no-page-transition">Back to top ↑</a></div>`;
  }

  function releaseStaleScrollLocks({ resetPanels = false } = {}) {
    const searchModal = $(".header-search-modal");
    const filterDrawer = $(".shop-sidebar");
    const mobileMenu = $("#mobileMenu");

    if (!searchModal || searchModal.hidden) document.body.classList.remove("search-is-open");
    if (!filterDrawer?.classList.contains("active")) document.body.classList.remove("filters-open");
    if (!mobileMenu?.classList.contains("active")) document.body.classList.remove("mobile-nav-open");

    if (resetPanels) {
      if (searchModal) searchModal.hidden = true;
      filterDrawer?.classList.remove("active");
      mobileMenu?.classList.remove("active");
      document.body.classList.remove("search-is-open", "filters-open", "mobile-nav-open");
      $("#filterToggle")?.setAttribute("aria-expanded", "false");
      $("#hamburger")?.setAttribute("aria-expanded", "false");
    }

    document.documentElement.style.removeProperty("overflow");
    document.body.style.removeProperty("overflow");
  }

  function addImageFallbacks() {
    const markUnavailable = (image) => {
      if (!(image instanceof HTMLImageElement) || image.dataset.fallbackApplied) return;
      image.dataset.fallbackApplied = "true";
      image.classList.add("image-unavailable");
      image.alt = image.alt || "Image unavailable";
    };
    document.addEventListener("error", (event) => {
      const image = event.target;
      markUnavailable(image);
    }, true);
    document.querySelectorAll("img").forEach((image) => {
      if (image.complete && image.naturalWidth === 0) markUnavailable(image);
    });
  }

  async function init() {
    document.body.classList.add(`page-${page}`, "luxury-ready");
    document.body.id ||= "top";
    releaseStaleScrollLocks();
    enhanceLoader();
    enhanceNavigation();
    enhanceHeadings();
    rebuildFooter();
    addImageFallbacks();

    if (window.productsReady) {
      try { await window.productsReady; } catch (_) { /* Offline catalog fallback remains available. */ }
    }
    enhanceProductCards();
    enhanceEmptyStates();

    const observer = new MutationObserver(() => {
      enhanceProductCards();
      enhanceEmptyStates();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    if (!reducedMotion) requestAnimationFrame(() => document.body.classList.add("luxury-entered"));

    const desktopFilters = window.matchMedia("(min-width: 1021px)");
    desktopFilters.addEventListener("change", (event) => {
      if (event.matches) releaseStaleScrollLocks({ resetPanels: true });
    });
    window.addEventListener("pageshow", (event) => {
      if (event.persisted) releaseStaleScrollLocks({ resetPanels: true });
      else releaseStaleScrollLocks();
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
