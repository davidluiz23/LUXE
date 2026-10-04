const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const AxeBuilder = require('@axe-core/playwright').default;
const { startFixture } = require('./fixture.cjs');

let fixture;
before(async () => { fixture = await startFixture(); });
after(async () => { await fixture?.close(); });

test('new catalog filters persist, saved pieces stay neutral, and bag actions add once', async () => {
  const user = { id: 'new-catalog-customer', email: 'customer@example.com' };
  const { page, context, errors } = await fixture.openPage('shop.html', {
    width: 1440, state: { __auditUser: user }, saved: { luxe_logged_in: true, luxe_user: user },
  });
  try {
    await page.waitForSelector('.modern-shop-piece[data-id]');
    await page.selectOption('#sortBy', 'price-high');
    assert.deepEqual(await page.locator('.modern-shop-piece').evaluateAll(cards => cards.map(card => Number(card.dataset.id))), [1003, 1002, 1001]);
    await page.click('#catalogFilters > summary');
    await page.click('[data-catalog-color][data-color="black"]');
    assert.equal(await page.locator('.modern-shop-piece').count(), 1);
    await page.reload();
    await page.waitForSelector('.modern-shop-piece[data-id]');
    assert.match(page.url(), /color=black/);
    assert.equal(await page.locator('[data-catalog-color][data-color="black"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('.modern-shop-piece').count(), 1);
    await page.click('#catalogFilters > summary');
    await page.click('#resetFilters');
    assert.equal(await page.locator('.modern-shop-piece').count(), 3);
    assert.equal(new URL(page.url()).search, '');
    await page.locator('[data-save-piece][data-id="1002"]').click();
    const saved = page.locator('[data-save-piece][data-id="1002"]');
    assert.equal(await saved.getAttribute('aria-pressed'), 'true');
    assert.equal(await saved.evaluate(el => getComputedStyle(el).color), 'rgb(250, 247, 240)');
    await page.locator('[data-add-piece][data-id="1002"]').click();
    await page.waitForFunction(() => document.querySelector('.cart-count').textContent === '1');
    assert.match(await page.locator('.modern-shop-piece[data-id="1001"] .modern-piece-action').getAttribute('href'), /product\.html\?id=1001$/);
    await page.goto(fixture.base + '/wishlist.html');
    await page.waitForSelector('.modern-shop-piece[data-id="1002"]');
    await page.locator('[data-save-piece][data-id="1002"]').click();
    await page.waitForSelector('.modern-catalog-empty');
    assert.equal(await page.locator('.modern-shop-piece').count(), 0);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('admin stock controls new cards and catalog controls remain accessible on mobile', async () => {
  const { page, context, errors } = await fixture.openPage('shop.html', { width: 390, state: { __holdProducts: true } });
  try {
    await page.waitForFunction(() => typeof window.__releaseProducts === 'function');
    await page.evaluate(() => {
      window.__fixture[1].in_stock = false;
      window.__fixture[1].stock_quantity = 0;
      window.__fixture[1].image = 'assets/brand/product-placeholder.svg';
      window.__holdProducts = false;
      window.__releaseProducts();
    });
    await page.waitForSelector('.modern-shop-piece[data-id="1002"]');
    const soldOut = page.locator('.modern-shop-piece[data-id="1002"]');
    assert.equal(await soldOut.locator('.modern-piece-action').isDisabled(), true);
    assert.equal(await soldOut.locator('.modern-piece-action').textContent(), 'Sold out');
    assert.equal(await soldOut.locator('.modern-piece-image img').evaluate(el => getComputedStyle(el).clipPath), 'none');
    await page.click('#catalogFilters > summary');
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const audit = await new AxeBuilder({ page }).include('.modern-catalog').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      assert.deepEqual(audit.violations.map(item => ({ id: item.id, targets: item.nodes.map(node => node.target) })), [], `${width}px`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    }
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
