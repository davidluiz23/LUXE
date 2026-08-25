// Temporary working identity. When the client approves the final brand,
// update `name` and `skuPrefix` here instead of editing every page.
(function initializeBrandConfig() {
  "use strict";

  const config = Object.freeze({
    name: "ALKEBULAN",
    skuPrefix: "ALK",
    isWorkingName: false,
    mark: "assets/brand/alkebulan-mark.svg",
  });

  const workingName = "LUXE";
  const skippedParents = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA"]);

  function replaceWorkingName(value) {
    if (typeof value !== "string" || config.name === workingName) return value;
    // Never rewrite URLs or email addresses into names that may not have a
    // matching registered domain.
    if (/https?:\/\/|\bmailto:|\S+@\S+/.test(value)) return value;
    return value
      .replace(/\bLUXE\b/g, () => config.name)
      .replace(/\bLuxe\b/g, () => config.name);
  }

  function applyToNode(root) {
    if (!root) return;
    if (root.nodeType === Node.TEXT_NODE) {
      if (!skippedParents.has(root.parentElement?.tagName)) {
        const next = replaceWorkingName(root.nodeValue);
        if (next !== root.nodeValue) root.nodeValue = next;
      }
      return;
    }
    if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) return;

    const element = root.nodeType === Node.ELEMENT_NODE ? root : null;
    if (element && skippedParents.has(element.tagName)) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let textNode = walker.nextNode();
    while (textNode) {
      if (!skippedParents.has(textNode.parentElement?.tagName)) {
        const next = replaceWorkingName(textNode.nodeValue);
        if (next !== textNode.nodeValue) textNode.nodeValue = next;
      }
      textNode = walker.nextNode();
    }
  }

  function applyBrand() {
    document.title = replaceWorkingName(document.title);
    document.querySelectorAll('meta[name="description"], [title], [aria-label], [placeholder]').forEach((element) => {
      ["content", "title", "aria-label", "placeholder"].forEach((attribute) => {
        if (!element.hasAttribute(attribute)) return;
        const current = element.getAttribute(attribute);
        const next = replaceWorkingName(current);
        if (next !== current) element.setAttribute(attribute, next);
      });
    });
    applyToNode(document.body);

    if (config.name !== workingName && document.body) {
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          mutation.addedNodes.forEach(applyToNode);
          if (mutation.type === "characterData") applyToNode(mutation.target);
        });
      });
      observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    }
  }

  function loadLuxuryPresentation() {
    const pageName = (window.location.pathname.split("/").pop() || "index.html").toLowerCase();
    if (pageName === "admin.html") return;

    document.documentElement.classList.add("alkebulan-site");
    document.body?.classList.add("alkebulan-site");

    const favicon = document.querySelector('link[rel~="icon"]') || document.createElement("link");
    favicon.rel = "icon";
    favicon.type = "image/svg+xml";
    favicon.href = config.mark;
    if (!favicon.parentNode) document.head.appendChild(favicon);
  }

  window.LuxeBrand = Object.freeze({
    ...config,
    replaceWorkingName,
  });

  loadLuxuryPresentation();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyBrand, { once: true });
  } else {
    applyBrand();
  }
})();
