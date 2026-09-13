const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startFixture } = require('./fixture.cjs');

let fixture;
before(async () => { fixture = await startFixture(); });
after(async () => { await fixture?.close(); });

const references = [
  { key: 'ijele', label: 'Ijele', id: 902, name: 'Ijele Graphic Tee' },
  { key: 'durbar', label: 'Durbar', id: 901, name: 'Durbar Graphic Tee' },
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

async function collectionState(page) {
  return page.locator('#collectionGrid [data-collection-artwork]').evaluateAll(links => links.map(link => ({
    artwork: link.dataset.collectionArtwork,
    name: link.querySelector('.collection-card-name').textContent.trim(),
    href: link.getAttribute('href'),
  })));
}

function expectedCollection(matched = false) {
  return references.map(item => ({artwork: item.key, name: item.label, href: matched ? `product.html?id=${item.id}` : 'shop.html'}));
}

test('reference artwork remains shoppable without inventing a product or price', async () => {
  const { page, context, errors } = await fixture.openPage('index.html');
  try {
    await page.waitForFunction(() => window.LuxeCatalogStatus?.state === 'ready');
    assert.equal((await stageState(page)).name, 'Ijele');
    assert.deepEqual(await collectionState(page), expectedCollection());
    assert.equal(await page.locator('#detailLink').getAttribute('href'), 'shop.html');
    assert.match(await page.locator('#detailLink').textContent(), /Explore Durbar/);
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

test('matching catalog products keep artwork labels, destinations, and both currencies consistent', async () => {
  const { page, context, errors } = await fixture.openPage('index.html', { state: { __fixture: catalog } });
  try {
    await page.waitForFunction(() => document.querySelector('#stageLink').getAttribute('href') === 'product.html?id=902');
    assert.deepEqual(await collectionState(page), expectedCollection(true));
    assert.equal(await page.locator('#detailLink').getAttribute('href'), 'product.html?id=901');
    assert.match(await page.locator('#detailLink').textContent(), /Explore Durbar/);
    assert.doesNotMatch(await page.locator('#detailLink').textContent(), /Graphic Tee/);
    for (const item of references) {
      await page.click(`[data-artwork="${item.key}"]`);
      await page.waitForFunction(name => document.querySelector('#stageName').textContent === name, item.label);
      const expectedPrice = await page.evaluate(id => {
        const money = window.LuxeMoney.forProduct(window.getProducts().find(product => product.id === id));
        return [money.ngn, money.usd].filter(Boolean).join(' / ');
      }, item.id);
      assert.ok(expectedPrice.includes('$') && expectedPrice.includes('₦'), 'fixture must exercise both supported currencies');
      assert.deepEqual(await stageState(page), {
        image: `assets/products/${item.key}.jpg`, name: item.label, price: expectedPrice, priceHidden: false,
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
    catalog[1], { ...catalog[1], id: 904, name: 'Durbar Alternate Tee' },
    { ...catalog[0], brand: 'Another Brand' },
    { ...catalog[2], name: 'Dundun Everyday Tee' },
  ];
  const { page, context } = await fixture.openPage('index.html', { state: { __fixture: products } });
  try {
    await page.waitForFunction(() => window.LuxeCatalogStatus?.state === 'ready');
    assert.deepEqual(await collectionState(page), expectedCollection());
    assert.equal(await page.locator('#detailLink').getAttribute('href'), 'shop.html');
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

test('an unavailable catalog keeps all three editorial previews visible and safely linked', async () => {
  const { page, context, errors } = await fixture.openPage('index.html', { state: { __failProducts: true } });
  try {
    await page.waitForFunction(() => window.LuxeCatalogStatus?.state === 'unavailable');
    assert.deepEqual(await collectionState(page), expectedCollection());
    for (const card of await page.locator('#collectionGrid .collection-card').all()) assert.equal(await card.isVisible(), true);
    assert.equal(await page.locator('.collection-empty').count(), 0);
    await page.click('[data-artwork="durbar"]');
    await page.waitForFunction(() => document.querySelector('#stageName').textContent === 'Durbar');
    const current = await stageState(page);
    assert.equal(current.href, 'shop.html');
    assert.equal(current.priceHidden, true);
    assert.equal(await page.locator('#detailLink').getAttribute('href'), 'shop.html');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('featured artwork is selectable with native keys and directional keyboard navigation', async () => {
  const { page, context, errors } = await fixture.openPage('index.html', { width: 360 });
  try {
    const selector = page.locator('[data-artwork="ijele"]');
    await selector.focus();
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => document.querySelector('[data-artwork="durbar"]').getAttribute('aria-pressed') === 'true');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.artwork), 'durbar');
    await page.keyboard.press('End');
    await page.waitForFunction(() => document.querySelector('#stageName').textContent === 'Dùn Dùn');
    await page.keyboard.press('Home');
    await page.waitForFunction(() => document.querySelector('#stageName').textContent === 'Ijele');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Space');
    await page.waitForFunction(() => document.querySelector('#stageName').textContent === 'Durbar');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('artwork previews remain readable and reachable across mobile, tablet, and desktop layouts', async () => {
  for (const width of [360, 768, 1122, 1440]) {
    const { page, context, errors } = await fixture.openPage('index.html', { width });
    try {
      const cards = page.locator('#collectionGrid [data-collection-artwork]');
      assert.equal(await cards.count(), 3);
      for (const card of await cards.all()) {
        await card.scrollIntoViewIfNeeded();
        assert.equal(await card.isVisible(), true);
        const box = await card.boundingBox();
        assert.ok(box.x >= 0 && box.x + box.width <= width, `A collection card extends beyond the ${width}px viewport`);
        const cardImage = card.locator('img');
        await cardImage.evaluate(image => image.decode());
        assert.ok(await cardImage.evaluate(image => image.naturalWidth > 0));
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${width}px layout overflows`);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
});

test('the compact header keeps search and navigation keyboard accessible at every width', async () => {
  for (const width of [390, 760, 761, 1021, 1120, 1121, 1440]) {
    const { page, context, errors } = await fixture.openPage('index.html', { width });
    try {
      await page.click('#searchToggle');
      await page.fill('#headerSearchInput', 'Audit');
      await page.waitForSelector('.search-result-item');
      assert.equal(await page.locator('.search-result-item').count(), 8);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#headerSearchModal').isHidden(), true);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'searchToggle');
      assert.equal(await page.locator('#mobileMenu').evaluate(menu => menu.inert), true);
      await page.locator('#hamburger').focus();
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => document.querySelector('#hamburger').getAttribute('aria-expanded') === 'true');
      assert.equal(await page.locator('#mobileMenu').evaluate(menu => menu.inert), false);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'mobileClose');
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#mobileMenu').evaluate(menu => menu.inert), true);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'hamburger');
      assert.equal(await page.locator('.nav-menu-overlay').isHidden(), true);
      assert.equal(await page.locator('#navLinks').isVisible(), width > 1120);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
});

test('homepage utilities and the wordmark stay visible from small phones to full-screen desktops', async () => {
  const { page, context, errors } = await fixture.openPage('index.html');
  try {
    for (const width of [320, 390, 768, 1100, 1440, 1920, 2560]) {
      await page.setViewportSize({width, height: 1080});
      const header = await page.locator('#navbar').boundingBox();
      assert.equal(await page.locator('.logo .brand-wordmark').isVisible(), true);
      const logo = await page.locator('.logo a').boundingBox();
      const utilities = await page.locator('.nav-icons').boundingBox();
      assert.ok(logo.x + logo.width <= utilities.x, `The wordmark overlaps the controls at ${width}px`);
      assert.equal(await page.locator('.navbar-notification-badge').isHidden(), true, 'An empty notification count must stay hidden');
      for (const selector of ['.search-icon', '.cart-icon', '.notification-icon', '.user-icon']) {
        const control = page.locator('.nav-icons ' + selector);
        assert.equal(await control.isVisible(), true, `${selector} is missing at ${width}px`);
        const box = await control.boundingBox();
        const icon = await control.locator('svg').boundingBox();
        assert.ok(icon?.width >= 18 && icon.height >= 18, `${selector} collapses at ${width}px`);
        assert.ok(box.x >= header.x && box.x + box.width <= header.x + header.width, `${selector} escapes the header at ${width}px`);
        assert.ok(icon.x >= box.x && icon.x + icon.width <= box.x + box.width, `${selector} icon escapes its button at ${width}px`);
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    }
    for (const href of ['shop.html', 'about.html', 'dashboard.html', 'shipping.html', 'returns.html', 'faq.html', 'privacy.html', 'terms.html', 'contact.html']) {
      const link = page.locator(`footer a[href="${href}"]`).first();
      await link.scrollIntoViewIfNeeded();
      assert.equal(await link.isVisible(), true, `Footer is missing ${href}`);
    }
    await page.click('.notification-icon');
    await page.waitForURL('**/login.html?returnTo=dashboard.html%3Ftab%3Dnotifications', {waitUntil: 'domcontentloaded', timeout: 60000});
    assert.equal(await page.locator('.logo .brand-wordmark').count(), 0, 'The navigation wordmark belongs only on the homepage');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('homepage profile and notifications use the signed-in account', async () => {
  const user = {id: 'home-customer', email: 'customer@example.com', user_metadata: {full_name: 'Home Customer'}};
  const { page, context, errors } = await fixture.openPage('index.html', {state: {__auditUser: user}});
  try {
    await page.waitForFunction(() => document.querySelector('.user-icon').getAttribute('href') === 'dashboard.html');
    assert.equal(await page.locator('.user-icon').isVisible(), true);
    assert.equal(await page.locator('.notification-icon').isVisible(), true);
    assert.equal(await page.locator('.notification-icon').getAttribute('href'), 'dashboard.html?tab=notifications');
    await page.click('.notification-icon');
    await page.waitForURL('**/dashboard.html?tab=notifications');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('notification sign-in returns to notifications and rejects unrelated redirect destinations', async () => {
  const user = {id: 'notification-customer', email: 'customer@example.com', user_metadata: {full_name: 'Notification Customer'}};
  const destination = 'dashboard.html?tab=notifications';
  const {page, context, errors} = await fixture.openPage('login.html?returnTo=' + encodeURIComponent(destination));
  try {
    assert.deepEqual(await page.evaluate(() => [
      window.safeAuthReturnPath('checkout.html'),
      window.safeAuthReturnPath('dashboard.html?tab=notifications'),
      window.safeAuthReturnPath('https://example.com'),
      window.safeAuthReturnPath('//example.com'),
      window.safeAuthReturnPath('admin.html'),
    ]), ['checkout.html', destination, 'index.html', 'index.html', 'index.html']);
    await page.waitForFunction(() => window.LuxeAuth?.isReady());
    await context.addInitScript(customer => { window.__auditUser = customer; }, user);
    await page.evaluate(customer => {
      window.LuxeAuth.signInWithPassword = async () => ({data: {user: customer}, error: null});
    }, user);
    await page.fill('#loginForm input[type="email"]', user.email);
    await page.fill('#loginForm input[type="password"]', 'test-only-password');
    await page.click('#standardLoginBtn');
    await page.waitForURL('**/dashboard.html?tab=notifications', {waitUntil: 'domcontentloaded', timeout: 60000});
    await page.goto(fixture.base + '/auth-callback.html?returnTo=' + encodeURIComponent(destination));
    await page.waitForURL('**/dashboard.html?tab=notifications', {waitUntil: 'domcontentloaded', timeout: 60000});
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

async function enableSlideshowClock(page) {
  const time = new Date('2026-09-12T12:00:00Z');
  await page.clock.install({time});
  await page.clock.pauseAt(new Date(time.getTime() + 10000));
  await page.emulateMedia({reducedMotion: 'no-preference'});
  await page.clock.runFor(20);
  await page.evaluate(() => {
    // Start a fresh five-second interval without a pointer or focused control.
    const button = document.querySelector('#stagePlayback');
    if (document.querySelector('#productStage').dataset.slideshowPlaying === 'true') button.click();
    button.click();
  });
}

test('the shirt slideshow advances every five seconds, wraps, and keeps catalog details together', async () => {
  const { page, context, errors } = await fixture.openPage('index.html', {width: 1440, state: {__fixture: catalog}});
  try {
    await page.waitForFunction(() => document.querySelector('#stageLink').getAttribute('href') === 'product.html?id=902');
    await enableSlideshowClock(page);
    await page.clock.runFor(4999);
    assert.equal((await stageState(page)).name, 'Ijele');
    for (const [elapsed, item] of [[1, references[1]], [5000, references[2]], [5000, references[0]]]) {
      await page.clock.runFor(elapsed);
      const state = await stageState(page);
      assert.equal(state.name, item.label);
      assert.equal(state.image, `assets/products/${item.key}.jpg`);
      assert.equal(state.href, `product.html?id=${item.id}`);
      assert.deepEqual(state.pressed, [item.key]);
    }
    await page.evaluate(() => document.querySelector('#stagePlayback').click());
    await page.clock.runFor(10000);
    assert.equal((await stageState(page)).name, 'Ijele');
    await page.evaluate(() => document.querySelector('[data-artwork="dun-dun"]').click());
    assert.equal((await stageState(page)).name, 'Dùn Dùn');
    await page.evaluate(() => document.querySelector('#stagePlayback').click());
    await page.clock.runFor(5000);
    assert.equal((await stageState(page)).name, 'Ijele');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('slideshow pauses for hover, keyboard use, reduced motion, and an offscreen hero', async () => {
  const { page, context, errors } = await fixture.openPage('index.html', {width: 1440});
  try {
    await enableSlideshowClock(page);
    const stage = await page.locator('#productStage').boundingBox();
    await page.mouse.move(stage.x + 10, stage.y + 10);
    await page.clock.runFor(6000);
    assert.equal((await stageState(page)).name, 'Ijele');
    await page.mouse.move(0, 0);
    await page.clock.runFor(5000);
    assert.equal((await stageState(page)).name, 'Durbar');
    await page.locator('[data-artwork="durbar"]').focus();
    await page.clock.runFor(6000);
    assert.equal((await stageState(page)).name, 'Durbar');
    await page.locator('#searchToggle').focus();
    await page.clock.runFor(5000);
    assert.equal((await stageState(page)).name, 'Dùn Dùn');
    await page.emulateMedia({reducedMotion: 'reduce'});
    await page.clock.runFor(6000);
    assert.equal((await stageState(page)).name, 'Dùn Dùn');
    assert.equal(await page.locator('#stageImage').evaluate(image => image.getAnimations().length), 0);
    await page.emulateMedia({reducedMotion: 'no-preference'});
    await page.locator('footer').evaluate(footer => footer.scrollIntoView({behavior: 'instant'}));
    await page.clock.runFor(100);
    assert.equal(await page.locator('#productStage').getAttribute('data-slideshow-playing'), 'false');
    await page.clock.runFor(6000);
    assert.equal((await stageState(page)).name, 'Dùn Dùn');
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
