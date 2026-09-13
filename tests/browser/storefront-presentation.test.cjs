const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startFixture } = require('./fixture.cjs');

let fixture;
before(async () => { fixture = await startFixture(); });
after(async () => { await fixture?.close(); });

test('search stays centered and the menu covers the viewport without moving the page', async () => {
  for (const name of ['index.html', 'shop.html']) {
    const { page, context, errors } = await fixture.openPage(name);
    try {
      for (const width of [320, 390, 1121, 1440, 2560]) {
        await page.setViewportSize({ width, height: 900 });
        const nav = await page.locator('#navbar').evaluate(header => {
          const search = header.querySelector('#searchToggle');
          const button = search.getBoundingClientRect();
          const icon = search.querySelector('svg').getBoundingClientRect();
          return {
            centered: Math.abs(button.x + button.width / 2 - icon.x - icon.width / 2) < 1
              && Math.abs(button.y + button.height / 2 - icon.y - icon.height / 2) < 1,
            square: icon.width === icon.height && icon.width >= 19,
            inside: button.left >= 0 && button.right <= innerWidth,
            blur: getComputedStyle(header).backdropFilter,
            background: getComputedStyle(header).backgroundColor,
            overflow: document.documentElement.scrollWidth > innerWidth,
          };
        });
        assert.equal(nav.centered && nav.square && nav.inside && !nav.overflow, true, `${name} at ${width}: ${JSON.stringify(nav)}`);
        assert.equal(nav.blur, 'blur(8px)');
        assert.match(nav.background, /0\.84\)$/);
      }
      assert.equal(await page.locator('.nav-scroll-progress').count(), 0);
      for (const width of [320, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.evaluate(() => scrollTo({ top: 800, behavior: 'instant' }));
        const scroll = await page.evaluate(() => scrollY);
        await page.click('#searchToggle');
        const backdrop = await page.locator('#headerSearchModal').evaluate(el => getComputedStyle(el).backdropFilter);
        await page.keyboard.press('Escape');
        await page.click('#hamburger');
        assert.equal(await page.locator('.nav-menu-overlay').evaluate(el => getComputedStyle(el).backdropFilter), backdrop);
        const box = await page.locator('.nav-menu-overlay').boundingBox();
        const contentWidth = await page.evaluate(() => document.documentElement.clientWidth);
        assert.deepEqual(box, { x: 0, y: 0, width: contentWidth, height: 900 });
        assert.equal(await page.evaluate(() => scrollY), scroll, `${name} menu opening at ${width}`);
        assert.equal(await page.evaluate(() => document.activeElement.id), 'mobileClose');
        await page.keyboard.press('Shift+Tab');
        assert.equal(await page.evaluate(() => document.activeElement.closest('#mobileMenu') !== null), true);
        await page.keyboard.press('Tab');
        assert.equal(await page.evaluate(() => document.activeElement.id), 'mobileClose');
        await page.mouse.click(4, 4);
        assert.equal(await page.locator('.nav-menu-overlay').isHidden(), true);
        assert.equal(await page.evaluate(() => document.activeElement.id), 'hamburger');
        assert.equal(await page.evaluate(() => scrollY), scroll, `${name} menu closing at ${width}`);
      }
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
});

test('homepage back to top works before the catalog resolves', async () => {
  const { page, context, errors } = await fixture.openPage('index.html', { state: { __holdProducts: true } });
  try {
    await page.waitForFunction(() => typeof window.__releaseProducts === 'function');
    await page.evaluate(() => scrollTo({ top: 1000, behavior: 'instant' }));
    await page.waitForSelector('#backToTop.visible');
    await page.click('#backToTop');
    await page.waitForFunction(() => scrollY === 0);
    assert.equal(await page.locator('#backToTop').getAttribute('tabindex'), '-1');
    assert.equal(await page.locator('#collectionGrid .product-card').count(), 0);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('collection pages show branded pending cards and restore useful Rater cards after loading', async () => {
  for (const name of ['shop.html', 'men.html', 'women.html', 'wishlist.html', 'product.html?id=1001']) {
    const user = { id: 'presentation-customer', email: 'customer@example.com' };
    const { page, context, errors } = await fixture.openPage(name, {
      width: 1440, state: { __holdProducts: true, __auditUser: user },
      saved: { luxe_logged_in: true, luxe_user: user, 'luxe_wishlist_user_presentation-customer': [1001, 1002] },
    });
    try {
      await page.waitForFunction(() => typeof window.__releaseProducts === 'function');
      const loading = page.locator('.product-card-skeleton').first();
      assert.equal(await loading.locator('.product-loading-name').textContent(), 'ALKEBULAN', name);
      assert.ok((await loading.locator('.product-image').boundingBox()).height > 120, name);
      assert.equal(await loading.locator('.product-loading-mark').evaluate(el => getComputedStyle(el).animationName), 'none');
      await page.evaluate(() => { window.__holdProducts = false; window.__releaseProducts(); });
      await page.waitForSelector('.product-card[data-luxury-card]');
      assert.equal(await page.locator('.product-card-skeleton').count(), 0, name);
      for (const width of [1440, 320]) {
        await page.setViewportSize({ width, height: 900 });
        const card = page.locator('.product-card[data-luxury-card]').first();
        const result = await card.evaluate(el => ({
          background: getComputedStyle(el).backgroundColor,
          radius: parseFloat(getComputedStyle(el).borderRadius),
          actionsBelow: el.querySelector('.product-actions').parentElement === el,
          categoryFirst: el.querySelector('.product-info').firstElementChild.classList.contains('product-category'),
          overflow: el.scrollWidth > el.clientWidth || document.documentElement.scrollWidth > innerWidth,
        }));
        assert.deepEqual(result, { background: 'rgb(236, 236, 234)', radius: width === 320 ? 20 : 24, actionsBelow: true, categoryFirst: true, overflow: false }, `${name} at ${width}`);
        assert.equal(await card.locator('.product-rating').isVisible(), true, name);
        assert.equal(await card.locator('.product-name-link').isVisible(), true, name);
        assert.equal(await card.locator('.add-cart').isVisible(), true, name);
      }
      assert.deepEqual(errors, [], name);
    } finally { await context.close(); }
  }
});

test('branded image loading clears on success and failure, with shopping actions still working', async () => {
  const { page, context, errors } = await fixture.openPage('shop.html', { width: 1440, state: { __holdProducts: true } });
  let releaseImages;
  const imageGate = new Promise(resolve => { releaseImages = resolve; });
  try {
    await page.waitForFunction(() => typeof window.__releaseProducts === 'function');
    await context.route('**/assets/products/*.jpg', async route => {
      await imageGate;
      if (route.request().url().endsWith('broken.jpg')) await route.abort();
      else await route.continue();
    });
    await page.evaluate(() => {
      window.__fixture[0].image = 'assets/products/ijele.jpg';
      window.__fixture[1].image = 'assets/products/broken.jpg';
      window.__holdProducts = false;
      window.__releaseProducts();
    });
    const first = page.locator('.product-card[data-id="1001"]');
    const second = page.locator('.product-card[data-id="1002"]');
    await first.scrollIntoViewIfNeeded();
    await page.waitForSelector('.product-card.is-image-loading .product-loading-lockup');
    assert.equal(await first.locator('.product-loading-name').textContent(), 'ALKEBULAN');
    assert.equal(await second.locator('.product-loading-name').textContent(), 'ALKEBULAN');
    releaseImages();
    await page.waitForFunction(() => [1001, 1002].every(id => {
      const card = document.querySelector(`.product-card[data-id="${id}"]`);
      return !card.classList.contains('is-image-loading') && !card.querySelector('.product-loading-lockup');
    }));
    assert.ok(await first.locator('.product-image > img').first().evaluate(img => img.naturalWidth > 0));
    await second.locator('.add-cart').click();
    await page.waitForFunction(() => Number(document.querySelector('.cart-count').textContent) > 0);
    assert.deepEqual(errors, []);
  } finally { releaseImages(); await context.close(); }
});
