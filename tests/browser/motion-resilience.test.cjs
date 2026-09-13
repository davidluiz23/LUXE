const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startFixture } = require('./fixture.cjs');
let fixture;
before(async () => { fixture = await startFixture(); });
after(async () => { await fixture?.close(); });
const admin = { __auditUser: { id: 'admin-audit', email: 'admin@example.com' }, __auditRole: 'owner' };

test('sections and dynamically added cards enter subtly; reduced motion and keyboard focus settle them', async () => {
  const { page, context, errors } = await fixture.openPage('index.html', { reducedMotion: 'no-preference' });
  try {
    await context.addInitScript(() => {
      const animate = Element.prototype.animate;
      window.__motionRecords = [];
      Element.prototype.animate = function(frames, options) {
        if (options?.duration === 420) window.__motionRecords.push({ id: this.id, classes: this.className, frames, duration: options.duration, delay: options.delay });
        return animate.call(this, frames, options);
      };
    });
    await page.reload();
    await page.waitForFunction(() => window.__motionRecords.some(row => String(row.classes).includes('opening-eyebrow')));
    await page.locator('.detail-copy').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => window.__motionRecords.some(row => row.classes === 'detail-copy'));
    const records = await page.evaluate(() => window.__motionRecords);
    assert.ok(records.every(row => row.duration <= 420 && row.delay <= 105 && row.frames[0].opacity >= .7));
    await page.evaluate(() => {
      const grid = document.createElement('div'); grid.className = 'product-grid';
      const card = document.createElement('article'); card.className = 'product-card'; card.id = 'motion-test-card';
      const link = document.createElement('a'); link.href = 'shop.html'; link.textContent = 'Browse collection';
      card.append(link); grid.append(card); document.querySelector('main').append(grid); card.scrollIntoView({ behavior: 'instant' });
    });
    await page.waitForFunction(() => window.__motionRecords.some(row => row.id === 'motion-test-card'));
    await page.locator('#motion-test-card a').focus();
    assert.equal(await page.locator('#motion-test-card').evaluate(element => element.getAnimations().length), 0);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.evaluate(() => {
      const element = document.createElement('article'); element.id = 'motion-reduced'; element.className = 'support-card'; element.textContent = 'Readable without animation';
      document.querySelector('main').append(element); element.scrollIntoView({ behavior: 'instant' });
    });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await page.locator('#motion-reduced').evaluate(element => getComputedStyle(element).opacity), '1');
    assert.equal(await page.locator('#motion-reduced').evaluate(element => element.getAnimations().length), 0);
    assert.equal(await page.locator('#reveal-animation-styles').count(), 0, 'Old hiding styles must not be injected');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('missing observers or failed animation APIs cannot hide the page or block its navigation', async () => {
  const { page, context, errors } = await fixture.openPage('index.html', { reducedMotion: 'no-preference', state: { __disableIntersectionObserver: true } });
  try {
    await page.locator('.detail-copy').scrollIntoViewIfNeeded();
    assert.equal(await page.locator('.detail-copy').evaluate(element => getComputedStyle(element).opacity), '1');
    await page.evaluate(() => {
      Element.prototype.animate = () => { throw new Error('Motion unavailable'); };
      window.LuxeMotion.enter(document.querySelector('.detail-copy'));
    });
    assert.equal(await page.locator('.detail-copy').isVisible(), true);
    await page.click('#searchToggle');
    await page.waitForSelector('#headerSearchModal', { state: 'visible' });
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#headerSearchModal').isHidden(), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('broken published photos show a branded fallback and recover on reconnection', async () => {
  const { page, context, errors } = await fixture.openPage('index.html');
  try {
    const content = await page.evaluate(() => window.LuxeSiteContent.defaults());
    content.slides[0] = { id: 'new-print', title: 'New print', alt: 'New graphic tee', image: 'https://media.example.com/missing-tee.jpg', productId: 1001 };
    content.detail.image = 'https://media.example.com/missing-detail.jpg';
    content.collections.men.image = 'https://media.example.com/missing-men.jpg';
    content.collections.women.image = 'https://media.example.com/missing-women.jpg';
    await context.addInitScript(content => { window.__siteContent = { content, revision: 2, updatedAt: '2026-09-13T12:00:00Z' }; }, content);
    const failImage = route => route.fulfill({ status: 404, body: '' });
    await context.route('https://media.example.com/**', failImage);
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#stageImage').dataset.imageFallback === 'true');
    assert.equal(await page.locator('#stageName').textContent(), 'New print');
    assert.equal(await page.locator('#stageImage').getAttribute('src'), 'assets/brand/product-placeholder.svg');
    await page.waitForFunction(() => document.querySelector('.detail-image img').dataset.imageFallback === 'true');
    await page.click('[data-artwork="durbar"]');
    await page.waitForFunction(() => document.querySelector('#stageName').textContent === 'Durbar');
    await page.click('[data-artwork="new-print"]');
    await page.waitForFunction(() => document.querySelector('#stageName').textContent === 'New print');
    await context.unroute('https://media.example.com/**', failImage);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await page.waitForFunction(() => document.querySelector('#stageImage').dataset.imageFallback === 'false');
    assert.equal(await page.locator('#stageImage').getAttribute('src'), content.slides[0].image);
    await context.route('https://media.example.com/**', failImage);
    for (const kind of ['men', 'women']) {
      await page.goto(fixture.base + '/' + kind + '.html');
      await page.waitForFunction(key => document.querySelector('.' + key + '-hero').dataset.imageFallback === 'true', kind);
      assert.match(await page.locator('.' + kind + '-hero').evaluate(element => element.style.backgroundImage), /product-placeholder/);
    }
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('slow admin reads recover and an uncertain save preserves its draft without retrying the write', async () => {
  const { page, context, errors } = await fixture.openPage('admin.html', { state: admin });
  try {
    await page.waitForFunction(() => document.querySelector('#audienceRegistered').textContent === '1,342');
    await page.clock.install();
    await page.clock.pauseAt(new Date());
    await page.evaluate(() => { window.__holdRpc = 'admin_audience_metrics_v1'; });
    await page.click('#refreshAudience');
    await page.clock.runFor(12001);
    assert.match(await page.locator('#audienceStatus').textContent(), /Metrics unavailable/);
    assert.equal(await page.locator('#refreshAudience').isEnabled(), true);
    assert.equal(await page.locator('#audienceRegistered').textContent(), '—');
    await page.evaluate(() => { window.__holdRpc = null; window.__releaseRpc(); });
    await page.click('#refreshAudience');
    await page.waitForFunction(() => document.querySelector('#audienceRegistered').textContent === '1,342');
    await page.click('[data-panel="storefrontPanel"]');
    await page.waitForSelector('.admin-slide-editor');
    await page.fill('#content-slides-0-title', 'A new opening');
    await page.evaluate(() => { window.__holdRpc = 'admin_save_storefront_content_v1'; });
    await page.click('#saveStorefront');
    await page.clock.runFor(18001);
    assert.match(await page.locator('#storefrontStatus').textContent(), /save could not be confirmed/);
    assert.equal(await page.inputValue('#content-slides-0-title'), 'A new opening');
    assert.equal(await page.locator('#reloadStorefront').isEnabled(), true);
    assert.equal(await page.evaluate(() => window.__requests.filter(row => row.rpc === 'admin_save_storefront_content_v1').length), 1);
    // The server may finish a write even when the response was lost.
    await page.evaluate(() => { window.__holdRpc = null; window.__releaseRpc(); });
    await page.click('#reloadStorefront');
    await page.waitForFunction(() => document.querySelector('#storefrontStatus').textContent.includes('version 2'));
    assert.equal(await page.inputValue('#content-slides-0-title'), 'A new opening');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
