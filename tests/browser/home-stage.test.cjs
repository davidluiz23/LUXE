const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startFixture } = require('./fixture.cjs');

let fixture;
before(async () => { fixture = await startFixture(); });
after(async () => { await fixture?.close(); });

const references = [
  { key: 'durbar', label: 'Durbar', id: 901, name: 'Durbar Graphic Tee' },
  { key: 'ijele', label: 'Ijele', id: 902, name: 'Ijele Graphic Tee' },
  { key: 'dun-dun', label: 'Dùn Dùn', id: 903, name: 'Dùn Dùn Graphic Tee' },
];
const catalog = references.map((item, index) => ({
  id: item.id, name: item.name, brand: 'ALKEBULAN', category: 'Men', subcategory: 'Shirts',
  price: 40 + index * 10, price_ngn: 60000 + index * 15000,
  image: `assets/products/${item.key}.jpg`, hover_image: '',
  sizes: ['M', 'L'], colors: ['Black'], tags: [],
  in_stock: true, stock_quantity: 5, description: '',
}));

async function stageState(page) {
  return page.evaluate(() => ({
    image: document.querySelector('#stageImage').getAttribute('src'),
    name: document.querySelector('#stageName').textContent,
    price: document.querySelector('#stagePrice').textContent,
    priceHidden: document.querySelector('#stagePrice').hidden,
    href: document.querySelector('#stageLink').getAttribute('href'),
    pressed: [...document.querySelectorAll('[data-artwork][aria-pressed="true"]')].map(button => button.dataset.artwork),
  }));
}

test('reference artwork remains shoppable without inventing a product or price', async () => {
  const { page, context, errors } = await fixture.openPage('index.html');
  try {
    await page.waitForFunction(() => window.LuxeCatalogStatus?.state === 'ready');
    for (const item of references) {
      await page.click(`[data-artwork="${item.key}"]`);
      await page.waitForFunction(label => document.querySelector('#stageName').textContent === label, item.label);
      assert.deepEqual(await stageState(page), {
        image: `assets/products/${item.key}.jpg`, name: item.label, price: '', priceHidden: true,
        href: 'shop.html', pressed: [item.key],
      });
    }
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('matching catalog products keep artwork, name, destination, and both currencies consistent', async () => {
  const { page, context, errors } = await fixture.openPage('index.html', { state: { __fixture: catalog } });
  try {
    await page.waitForFunction(name => document.querySelector('#stageName').textContent === name, catalog[0].name);
    for (const item of references) {
      await page.click(`[data-artwork="${item.key}"]`);
      await page.waitForFunction(name => document.querySelector('#stageName').textContent === name, item.name);
      const expectedPrice = await page.evaluate(id => {
        const money = window.LuxeMoney.forProduct(window.getProducts().find(product => product.id === id));
        return [money.ngn, money.usd].filter(Boolean).join(' / ');
      }, item.id);
      assert.ok(expectedPrice.includes('$') && expectedPrice.includes('₦'), 'fixture must exercise both supported currencies');
      assert.deepEqual(await stageState(page), {
        image: `assets/products/${item.key}.jpg`, name: item.name, price: expectedPrice, priceHidden: false,
        href: `product.html?id=${item.id}`, pressed: [item.key],
      });
    }
    await page.evaluate(() => {
      for (const key of ['ijele', 'durbar', 'dun-dun']) document.querySelector(`[data-artwork="${key}"]`).click();
    });
    await page.waitForFunction(() => document.querySelector('#stageLink').getAttribute('href') === 'product.html?id=903');
    assert.equal((await stageState(page)).image, 'assets/products/dun-dun.jpg');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('ambiguous names and other brands never bind references to unrelated products', async () => {
  const products = [
    catalog[0], { ...catalog[0], id: 904, name: 'Durbar Alternate Tee' },
    { ...catalog[1], brand: 'Another Brand' },
    { ...catalog[2], name: 'Dundun Everyday Tee' },
  ];
  const { page, context } = await fixture.openPage('index.html', { state: { __fixture: products } });
  try {
    await page.waitForFunction(() => window.LuxeCatalogStatus?.state === 'ready');
    for (const item of references) {
      await page.click(`[data-artwork="${item.key}"]`);
      await page.waitForFunction(label => document.querySelector('#stageName').textContent === label, item.label);
      const current = await stageState(page);
      assert.equal(current.href, 'shop.html');
      assert.equal(current.priceHidden, true);
      assert.equal(current.price, '');
    }
  } finally { await context.close(); }
});

test('an unavailable catalog keeps artwork usable and the collection retry recovers', async () => {
  const { page, context, errors } = await fixture.openPage('index.html', { state: { __failProducts: true } });
  try {
    await page.waitForSelector('.collection-empty');
    assert.match(await page.locator('.collection-empty').textContent(), /couldn.t load/i);
    await page.click('[data-artwork="ijele"]');
    await page.waitForFunction(() => document.querySelector('#stageName').textContent === 'Ijele');
    const current = await stageState(page);
    assert.equal(current.href, 'shop.html');
    assert.equal(current.priceHidden, true);
    // Simulate the service recovering on the next navigation, regardless of
    // the order in which Playwright runs the fixture's initialization scripts.
    await context.addInitScript(() => {
      Object.defineProperty(window, '__failProducts', { configurable: true, get: () => false, set() {} });
    });
    await page.click('.collection-empty a');
    await page.waitForFunction(() => window.LuxeCatalogStatus?.state === 'ready');
    await page.waitForSelector('#productGrid .product-card');
    assert.equal(await page.locator('.collection-empty').count(), 0);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('featured artwork is selectable with native keys and directional keyboard navigation', async () => {
  const { page, context, errors } = await fixture.openPage('index.html', { width: 360 });
  try {
    const selector = page.locator('[data-artwork="durbar"]');
    await selector.focus();
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => document.querySelector('[data-artwork="ijele"]').getAttribute('aria-pressed') === 'true');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.artwork), 'ijele');
    await page.keyboard.press('End');
    await page.waitForFunction(() => document.querySelector('#stageName').textContent === 'Dùn Dùn');
    await page.keyboard.press('Home');
    await page.waitForFunction(() => document.querySelector('#stageName').textContent === 'Durbar');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Space');
    await page.waitForFunction(() => document.querySelector('#stageName').textContent === 'Ijele');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('reduced motion keeps depth static and clears active pointer motion when changed', async () => {
  const { page, context, errors } = await fixture.openPage('index.html', { width: 1440 });
  try {
    const depth = () => page.locator('#productStage').evaluate(stage =>
      ['--depth-x', '--depth-y', '--depth-scroll'].map(property => stage.style.getPropertyValue(property)));
    const stage = await page.locator('#productStage').boundingBox();
    await page.mouse.move(stage.x + stage.width * .9, stage.y + stage.height * .3);
    await page.evaluate(() => window.scrollTo(0, 150));
    await page.waitForTimeout(100);
    assert.deepEqual(await depth(), ['', '', '']);
    await page.click('[data-artwork="ijele"]');
    await page.waitForFunction(() => document.querySelector('#stageName').textContent === 'Ijele');
    assert.equal(await page.locator('#stageImage').evaluate(image => image.getAnimations().length), 0);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const activeStage = await page.locator('#productStage').boundingBox();
    await page.mouse.move(activeStage.x + activeStage.width * .8, activeStage.y + activeStage.height * .4);
    await page.waitForFunction(() => parseFloat(document.querySelector('#productStage').style.getPropertyValue('--depth-y')) > 0);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => !document.querySelector('#productStage').style.getPropertyValue('--depth-y'));
    assert.deepEqual(await depth(), ['', '', '']);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
