// One renderer for the approved artwork cards and live shopping controls.
(function () {
  'use strict';
  const escape = value => window.LuxeUtils.escapeHtml(String(value ?? ''));
  const originals = { ijele: 'ijele.jpg', durbar: 'durbar.jpg', 'dun-dun': 'dun-dun.jpg' };

  function ownGrid(grid) {
    grid.classList.remove('product-grid', 'wishlist-grid');
    grid.classList.add('modern-catalog-grid');
  }

  function finishImages(grid) {
    grid.querySelectorAll('.modern-piece-image img').forEach(image => {
      const piece = image.closest('.modern-shop-piece');
      const finish = () => {
        piece.classList.remove('is-image-loading');
        piece.querySelector('.modern-piece-loading')?.remove();
        if (image.dataset.luxePlaceholderUsed === 'true' || !image.naturalWidth) piece.dataset.customPhoto = 'true';
      };
      if (!image.complete) {
        piece.classList.add('is-image-loading');
        image.addEventListener('load', finish, { once: true });
        image.addEventListener('error', finish, { once: true });
      } else finish();
    });
  }

  // Editorial designs have no invented product ID, price, or stock.
  function renderArtwork(grid, excludeKey = '') {
    if (!grid) return 0;
    const designs = (window.AlkebulanDesigns || []).filter(design => design.key !== excludeKey);
    ownGrid(grid);
    window.finishProductGridLoading?.(grid);
    grid.innerHTML = designs.map((design, index) => `<article class="modern-piece modern-shop-piece modern-artwork-piece" data-piece-card="${escape(design.key)}" data-custom-photo="false">
      <div class="modern-piece-media"><a class="modern-piece-image" href="product.html?piece=${escape(design.key)}" aria-label="Read about ${escape(design.name)}">
        <img ${window.LuxeMedia.attributes(design.image, { preset: 'card', alt: `The original black ${design.name} graphic tee`, priority: index === 0 })}>
        <span class="modern-piece-arrow" aria-hidden="true">&#8599;</span></a>
        <span class="modern-piece-loading" aria-hidden="true">${window.LuxeIcons.loader()}</span>
      </div>
      <div class="modern-piece-meta"><div><h3><a href="product.html?piece=${escape(design.key)}">${escape(design.name)}</a></h3><p>Graphic tee</p></div></div>
    </article>`).join('');
    window.LuxeMedia.hydrate(grid);
    finishImages(grid);
    return designs.length;
  }

  function price(product) {
    const money = window.LuxeMoney?.forProduct?.(product) || {};
    const primary = money.ngn || money.usd || money.text;
    if (!primary) return '<span>Price unavailable</span>';
    return `<span>${escape(primary)}</span>${money.ngn && money.usd ? `<small>${escape(money.usd)}</small>` : ''}`;
  }

  function card(product, index) {
    const id = Number(product.id);
    if (!Number.isSafeInteger(id) || id < 1) return '';
    const name = escape(product.name || 'Graphic tee');
    const key = window.LuxeCollection?.keyForProduct(product) || '';
    const custom = product.image !== `assets/products/${originals[key]}`;
    const options = !!(product.sizes?.length || product.colors?.length);
    const soldOut = product.inStock === false;
    const href = `product.html?id=${id}`;
    const rating = Number(product.rating), reviews = Number(product.reviewCount);
    const review = rating > 0 && reviews > 0
      ? `<p class="modern-piece-review">${Math.min(5, rating).toFixed(1)} / 5 <span>&middot; ${reviews} review${reviews === 1 ? '' : 's'}</span></p>` : '';
    return `<article class="modern-piece modern-shop-piece" data-id="${id}" data-piece-card="${escape(key)}" data-custom-photo="${custom}">
      <div class="modern-piece-media">
        <a class="modern-piece-image" href="${href}" aria-label="View ${name}">
          <img ${window.LuxeMedia.attributes(product.image, { preset: 'card', alt: product.name, priority: index === 0 })}>
          <span class="modern-piece-arrow" aria-hidden="true">&#8599;</span>
        </a>
        <span class="modern-piece-loading" aria-hidden="true">${window.LuxeIcons.loader()}</span>
        <button class="modern-piece-save" type="button" data-save-piece data-id="${id}" aria-label="Save ${name} to wishlist" aria-pressed="false">${window.LuxeIcons.svg('heart')}</button>
      </div>
      <div class="modern-piece-meta">
        <div><h3><a href="${href}">${name}</a></h3><p>${escape(product.subcategory || 'Graphic tee')}</p></div>
        <div class="modern-piece-price">${price(product)}</div>
      </div>
      <div class="modern-piece-bottom">${review}
        ${soldOut ? '<button class="modern-piece-action" type="button" disabled>Sold out</button>' : options
          ? `<a class="modern-piece-action" href="${href}" aria-label="Choose options for ${name}">Choose options <span aria-hidden="true">&#8599;</span></a>`
          : `<button class="modern-piece-action" type="button" data-add-piece data-id="${id}" aria-label="Add ${name} to bag">Add to bag <span aria-hidden="true">+</span></button>`}
      </div>
    </article>`;
  }

  function render(grid, products) {
    if (!grid) return;
    ownGrid(grid);
    window.finishProductGridLoading?.(grid);
    grid.innerHTML = products.map(card).join('');
    window.LuxeMedia.hydrate(grid);
    window.syncWishlistButtons?.(grid);
    grid.querySelectorAll('[data-save-piece]').forEach(button => button.addEventListener('click', () => window.toggleWishlist?.(Number(button.dataset.id), button)));
    grid.querySelectorAll('[data-add-piece]').forEach(button => button.addEventListener('click', async () => {
      if (button.disabled) return;
      button.disabled = true;
      try {
        const added = await window.addToCart?.(Number(button.dataset.id));
        if (added === true) {
          button.textContent = 'Added to bag';
          setTimeout(() => { if (button.isConnected) button.innerHTML = 'Add to bag <span aria-hidden="true">+</span>'; }, 1400);
        }
      } catch {
        window.showNotification?.('Could not add this piece. Please try again.', 'alert');
      } finally { button.disabled = false; }
    }));
    finishImages(grid);
  }

  function loading(grid, requestedCount) {
    ownGrid(grid);
    grid.classList.add('product-grid-loading');
    grid.setAttribute('aria-busy', 'true');
    grid.innerHTML = `<span class="sr-only" role="status">Loading the ALKEBULAN collection</span>${Array.from({ length: Math.min(3, requestedCount || 3) }, () =>
      `<article class="modern-piece modern-piece-skeleton" aria-hidden="true"><div class="modern-piece-image">${window.LuxeIcons?.loader() || ''}</div><div class="modern-piece-meta"><span></span></div></article>`).join('')}`;
  }

  window.LuxeCatalogUI = Object.freeze({ render, loading, renderArtwork });
})();
