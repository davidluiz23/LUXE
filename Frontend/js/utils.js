(function initializeLuxeUtilities(global) {
  "use strict";

  const HTML_ESCAPE_PATTERN = /[&<>"']/g;
  const HTML_ENTITIES = Object.freeze({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  });

  function escapeHtml(value) {
    return String(value ?? "").replace(
      HTML_ESCAPE_PATTERN,
      (character) => HTML_ENTITIES[character],
    );
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }

  global.LuxeUtils = Object.freeze({ escapeHtml, escapeAttr });
})(window);
