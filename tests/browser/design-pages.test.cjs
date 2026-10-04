const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startFixture } = require('./fixture.cjs');
let fixture;
before(async () => { fixture = await startFixture(); });
after(async () => { await fixture?.close(); });

test('all three shirts are in the collection HTML even with JavaScript disabled', async () => {
  for (const route of ['men.html', 'women.html', 'shop.html']) {
    const { page, context } = await fixture.openPage(route, { javaScriptEnabled: false, width: 390 });
    try {
      assert.equal(await page.locator('.modern-artwork-piece').count(), 3);
      for (const key of ['ijele', 'durbar', 'dun-dun']) {
        const card = page.locator(`.modern-artwork-piece[data-piece-card="${key}"]`);
        await card.scrollIntoViewIfNeeded();
        assert.equal(await card.locator('.modern-piece-image').getAttribute('href'), `product.html?piece=${key}`);
        assert.equal(await card.locator('img').isVisible(), true);
      }
    } finally { await context.close(); }
  }
});

test('shirts and their readable product pages work while inventory remains pending', async () => {
  const { page, context, errors } = await fixture.openPage('men.html', { width: 390, state: { __holdProducts: true } });
  try {
    assert.equal(await page.locator('.modern-artwork-piece').count(), 3);
    assert.equal(await page.locator('.modern-piece-skeleton').count(), 0);
    await page.locator('[data-piece-card="ijele"] .modern-piece-image').click();
    for (const key of ['ijele', 'durbar', 'dun-dun']) {
      if (key !== 'ijele') await page.goto(fixture.base + '/product.html?piece=' + key);
      await page.waitForSelector(`.modern-design-detail[data-design="${key}"]`);
      assert.ok((await page.locator('.modern-design-description').innerText()).length > 80);
      assert.ok((await page.locator('#designStory').innerText()).length > 150);
      assert.equal(await page.locator('#relatedProducts .modern-artwork-piece').count(), 2);
      assert.equal(await page.locator('#productAddToCart').count(), 0);
      await page.locator('.modern-design-zoom').click();
      assert.equal(await page.locator('.modern-design-dialog').isVisible(), true);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('.modern-design-dialog').isVisible(), false);
      for (const width of [320, 390, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, key + ' at ' + width);
      }
      await page.evaluate(() => { window.__fixture = []; window.__holdProducts = false; window.__releaseProducts(); });
      await page.evaluate(() => window.productsReady);
      assert.equal(await page.locator(`.modern-design-detail[data-design="${key}"]`).count(), 1);
    }
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('a published design resolves to its actual inventory and shopping controls', async () => {
  const { page, context, errors } = await fixture.openPage('product.html?piece=durbar');
  try {
    await page.waitForSelector('#productAddToCart');
    await page.click('#productAddToCart');
    await page.waitForFunction(() => Number(document.querySelector('.cart-count').textContent) === 1);
    assert.equal(await page.locator('.modern-design-detail').count(), 0);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
