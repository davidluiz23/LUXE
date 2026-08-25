// Header and catalog search. Results are constructed with DOM APIs so
// catalog text is never interpreted as executable markup.
(function initializeSearch() {
    "use strict";

    const formatPrice = (value) => `$${Number(value || 0).toFixed(2)}`;

    function getCatalog() {
        if (typeof window.getProducts === "function") return window.getProducts() || [];
        return window.products || [];
    }

    function createSearchModal() {
        const existing = document.getElementById("headerSearchModal");
        if (existing) return existing;

        const modal = document.createElement("div");
        modal.id = "headerSearchModal";
        modal.className = "header-search-modal";
        modal.hidden = true;
        modal.setAttribute("role", "dialog");
        modal.setAttribute("aria-modal", "true");
        modal.setAttribute("aria-labelledby", "searchModalTitle");
        modal.innerHTML = `
            <div class="search-modal-content">
                <button id="closeSearchModal" type="button" aria-label="Close search">&times;</button>
                <div class="search-modal-heading">
                    <span class="eyebrow">ALKEBULAN / Search the collection</span>
                    <h2 id="searchModalTitle">What are you looking for?</h2>
                </div>
                <div class="search-input-row">
                    <i class="fas fa-search" aria-hidden="true"></i>
                    <input type="search" id="headerSearchInput" placeholder="Type a piece, brand, or category" autocomplete="off" aria-describedby="searchInstructions">
                </div>
                <div id="headerSearchResults" aria-live="polite"></div>
                <p id="searchInstructions" class="search-keyboard-note">Enter at least two characters &nbsp; / &nbsp; Press Esc to close</p>
            </div>`;
        document.body.appendChild(modal);
        return modal;
    }

    function createEmptyState(message, detail) {
        const state = document.createElement("div");
        state.className = "search-empty-state";
        const label = document.createElement("span");
        label.className = "eyebrow";
        label.textContent = "Collection search";
        const title = document.createElement("strong");
        title.textContent = message;
        const copy = document.createElement("p");
        copy.textContent = detail;
        state.append(label, title, copy);
        return state;
    }

    function renderResults(container, query) {
        container.replaceChildren();
        if (query.length < 2) {
            container.appendChild(createEmptyState("Begin your search", "Try a product name, category, or designer."));
            return;
        }

        const normalized = query.toLocaleLowerCase();
        const matches = getCatalog().filter((product) => {
            const fields = [product.name, product.category, product.subcategory, product.brand, ...(product.tags || [])];
            return fields.some((field) => String(field || "").toLocaleLowerCase().includes(normalized));
        });

        if (!matches.length) {
            container.appendChild(createEmptyState("No pieces found", "Try a shorter term or explore the complete collection."));
            return;
        }

        const summary = document.createElement("div");
        summary.className = "search-result-summary";
        summary.textContent = `${matches.length} piece${matches.length === 1 ? "" : "s"} found`;
        const grid = document.createElement("div");
        grid.className = "search-results-grid";

        matches.slice(0, 8).forEach((product) => {
            const link = document.createElement("a");
            link.className = "search-result-item";
            link.href = `product.html?id=${encodeURIComponent(product.id)}`;

            const image = document.createElement("img");
            image.src = product.image;
            image.alt = product.name;
            image.loading = "lazy";

            const copy = document.createElement("span");
            copy.className = "search-result-copy";
            const name = document.createElement("strong");
            name.textContent = product.name;
            const category = document.createElement("small");
            category.textContent = [product.brand, product.category, product.subcategory].filter(Boolean).join(" / ");
            const price = document.createElement("em");
            price.textContent = formatPrice(product.price);
            copy.append(name, category, price);
            link.append(image, copy);
            grid.appendChild(link);
        });

        container.append(summary, grid);
    }

    document.addEventListener("DOMContentLoaded", async () => {
        if (window.productsReady) {
            try { await window.productsReady; } catch (_) { /* Offline fallback remains usable. */ }
        }

        const toggle = document.getElementById("searchToggle");
        const modal = createSearchModal();
        const input = document.getElementById("headerSearchInput");
        const results = document.getElementById("headerSearchResults");
        const closeButton = document.getElementById("closeSearchModal");
        let returnFocus = null;

        const openSearch = () => {
            returnFocus = document.activeElement;
            modal.hidden = false;
            document.body.classList.add("search-is-open");
            renderResults(results, "");
            window.setTimeout(() => input?.focus(), 30);
        };

        const closeSearch = () => {
            modal.hidden = true;
            document.body.classList.remove("search-is-open");
            if (input) input.value = "";
            if (returnFocus instanceof HTMLElement) returnFocus.focus();
        };

        toggle?.addEventListener("click", (event) => {
            event.preventDefault();
            openSearch();
        });
        closeButton?.addEventListener("click", closeSearch);
        modal.addEventListener("click", (event) => {
            if (event.target === modal) closeSearch();
        });
        input?.addEventListener("input", () => renderResults(results, input.value.trim()));

        document.addEventListener("keydown", (event) => {
            if (modal.hidden) return;
            if (event.key === "Escape") {
                event.preventDefault();
                closeSearch();
                return;
            }
            if (event.key !== "Tab") return;
            const focusable = Array.from(modal.querySelectorAll('button, input, a[href]')).filter((element) => !element.hidden);
            if (!focusable.length) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        });

        const shopSearch = document.getElementById("shopSearch");
        shopSearch?.addEventListener("input", () => filterProducts(shopSearch.value.toLocaleLowerCase().trim()));
    });

    function filterProducts(query) {
        document.querySelectorAll(".product-card").forEach((card) => {
            const name = card.querySelector(".product-name")?.textContent.toLocaleLowerCase() || "";
            const category = card.querySelector(".product-category")?.textContent.toLocaleLowerCase() || "";
            card.style.display = name.includes(query) || category.includes(query) ? "block" : "none";
        });
    }

    window.filterProducts = filterProducts;
})();
