// Lightweight, dependency-free ALKEBULAN SVG icon system.
// Icons inherit the surrounding text color and remain crisp at every size.
(function initializeLuxeIcons() {
  const paths = {
    user: '<path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="7" r="4"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/>',
    lock: '<rect width="16" height="11" x="4" y="11" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    bag: '<path d="M6 8h12l1 13H5L6 8Z"/><path d="M9 10V6a3 3 0 0 1 6 0v4"/>',
    mail: '<rect width="18" height="14" x="3" y="5" rx="2"/><path d="m3 7 9 6 9-6"/>',
    heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    alert: '<path d="M10.3 2.9 1.8 17a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 2.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    star: '<path d="m12 2.7 2.8 5.7 6.3.9-4.5 4.4 1 6.3-5.6-3-5.6 3 1-6.3-4.5-4.4 6.3-.9L12 2.7Z"/>',
  };

  function svg(name, className = "luxe-svg-icon") {
    const path = paths[name] || paths.alert;
    const fill = name === "star" ? ' fill="currentColor"' : ' fill="none"';
    return `<svg class="${className}" viewBox="0 0 24 24"${fill} stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${path}</svg>`;
  }

  function rating(value, className = "luxe-rating-icons") {
    const count = Math.max(0, Math.min(5, Math.round(Number(value) || 0)));
    return `<span class="${className}" aria-label="${Number(value || 0).toFixed(1)} out of 5">${Array.from({ length: count }, () => svg("star", "luxe-star-icon")).join("")}</span>`;
  }

  window.LuxeIcons = Object.freeze({ svg, rating });
})();
