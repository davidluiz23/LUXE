const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const AxeBuilder = require('@axe-core/playwright').default;
const { startFixture } = require('./fixture.cjs');
let fixture;
before(async () => { fixture = await startFixture(); });
after(async () => { await fixture?.close(); });
const admin = { __auditUser: { id: 'admin-audit', email: 'admin@example.com' }, __auditRole: 'owner' };

test('overview uses complete database totals, changes ranges, and never reports errors as zero', async () => {
  const { page, context, errors } = await fixture.openPage('admin.html', { width: 1440, state: admin });
  try {
    await page.waitForFunction(() => document.querySelector('#audienceRegistered').textContent === '1,342');
    assert.equal(await page.locator('#overviewPanel').isVisible(), true);
    assert.equal(await page.locator('#mobileMenu').isHidden(), true, 'The closed admin menu must not cover the dashboard');
    assert.equal(await page.locator('#audienceVisitors').textContent(), '32', 'Period visitors must not be the sum of daily returning visitors (38)');
    assert.equal(await page.locator('#audienceBanned').textContent(), '7');
    assert.equal(await page.locator('#audienceOnline').textContent(), '3');
    assert.equal(await page.locator('#audienceDailyRows tr').count(), 30);
    assert.match(await page.locator('#audienceDailyRows').textContent(), /Not recorded/);
    await page.click('[data-audience-days="7"]');
    await page.waitForFunction(() => document.querySelectorAll('#audienceDailyRows tr').length === 7);
    await page.click('[data-audience-days="90"]');
    await page.waitForFunction(() => document.querySelectorAll('#audienceDailyRows tr').length === 90);
    const audit = await new AxeBuilder({ page }).include('#overviewPanel').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    assert.deepEqual(audit.violations.map(item => ({ id: item.id, targets: item.nodes.map(node => node.target) })), []);
    await page.setViewportSize({ width: 390, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.click('#hamburger');
    await page.waitForFunction(() => document.querySelector('#hamburger').getAttribute('aria-expanded') === 'true');
    assert.equal(await page.locator('#mobileMenu').isVisible(), true);
    await page.keyboard.press('Escape');
    await page.waitForSelector('#mobileMenu', { state: 'hidden' });
    await page.evaluate(() => { window.__failAudience = true; });
    await page.click('#refreshAudience');
    await page.waitForFunction(() => document.querySelector('#audienceStatus').textContent.includes('Metrics unavailable'));
    assert.equal(await page.locator('#audienceRegistered').textContent(), '—');
    assert.equal(await page.locator('#audienceChart svg').count(), 0);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('an admin can add, reorder, remove and publish images that appear on the storefront', async () => {
  const { page, context, errors } = await fixture.openPage('admin.html', { width: 1440, state: admin });
  try {
    await page.waitForSelector('#adminLayout.visible');
    await page.click('[data-panel="storefrontPanel"]');
    await page.waitForSelector('.admin-slide-editor');
    await page.click('#addStorefrontSlide');
    await page.fill('#content-slides-3-image', 'https://images.example.com/new-tee.jpg');
    await page.fill('#content-slides-3-title', 'New season');
    await page.fill('#content-slides-3-alt', 'A new black graphic tee');
    await page.selectOption('#content-slides-3-productId', '1001');
    for (const index of [3, 2, 1]) await page.click(`[data-slide-action="up"][data-slide-index="${index}"]`);
    await page.click('[data-slide-action="remove"][data-slide-index="3"]');
    assert.equal(await page.locator('.admin-slide-editor').count(), 3);
    await page.fill('#content-collections-men-image', 'https://images.example.com/men.jpg');
    await page.fill('#content-collections-women-image', 'https://images.example.com/women.jpg');
    await page.fill('#content-detail-image', 'https://images.example.com/detail.jpg');
    await page.fill('#content-detail-alt', 'The new embroidery in detail');
    await page.fill('#content-detail-linkLabel', 'Explore the new tee');
    await page.selectOption('#content-detail-productId', '1001');
    await page.locator('#content-collections-women-focusY').evaluate(input => { input.value = '72'; input.dispatchEvent(new Event('input', { bubbles: true })); });
    const audit = await new AxeBuilder({ page }).include('#storefrontPanel').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    assert.deepEqual(audit.violations.map(item => ({ id: item.id, targets: item.nodes.map(node => node.target) })), []);
    await page.setViewportSize({ width: 390, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.click('#saveStorefront');
    await page.waitForFunction(() => document.querySelector('#storefrontStatus').textContent.startsWith('Images saved.'));
    const saved = await page.evaluate(() => window.__requests.find(request => request.rpc === 'admin_save_storefront_content_v1').args);
    assert.equal(saved.p_expected_revision, 1);
    assert.equal(saved.p_content.slides[0].title, 'New season');
    assert.equal(saved.p_content.slides[0].productId, 1001);
    assert.equal(saved.p_content.slides.some(slide => slide.id === 'dun-dun'), false);
    await page.goto(fixture.base + '/index.html');
    await page.waitForFunction(() => document.querySelector('#culturePieceName').textContent === 'New season');
    assert.equal(await page.locator('#cultureStage [data-piece-link]').getAttribute('href'), 'product.html?id=1001');
    assert.equal(await page.locator('#cultureShirt').getAttribute('src'), 'https://images.example.com/new-tee.jpg');
    assert.equal(await page.locator('.culture-piece-select button').count(), 3);
    for (const kind of ['men', 'women']) {
      await page.goto(fixture.base + '/' + kind + '.html');
      const hero = page.locator('.poster-catalog-hero');
      const image = hero.locator('.poster-catalog-art img');
      await page.waitForFunction(() => document.querySelector('.poster-catalog-art img').src.includes('images.example.com'));
      assert.equal(await image.getAttribute('src'), `https://images.example.com/${kind}.jpg`);
      assert.equal(await hero.evaluate(element => getComputedStyle(element).backgroundImage), 'none');
      assert.equal(await hero.locator('img').count(), 1);
      if (kind === 'women') assert.match(await image.evaluate(element => element.style.objectPosition), /72%/);
      // Refreshes load the published cache before the service responds. Neither
      // application may append a banner or restore the previous background.
      await page.reload();
      await page.waitForFunction(() => document.querySelector('.poster-catalog-art img').src.includes('images.example.com'));
      await page.evaluate(async () => {
        await window.LuxeSiteContent.load();
        window.LuxeSiteContent.applyImages();
        window.dispatchEvent(new CustomEvent('luxe:catalog-status'));
      });
      assert.equal(await image.getAttribute('src'), `https://images.example.com/${kind}.jpg`);
      assert.equal(await hero.locator('img').count(), 1);
      assert.equal(await hero.evaluate(element => getComputedStyle(element).backgroundImage), 'none');
      assert.equal(await page.locator('.category-campaign, .category-hero').count(), 0);
    }
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('failed uploads and saves preserve drafts, conflicts require a fresh revision, and one slide can stand alone', async () => {
  const { page, context, errors } = await fixture.openPage('admin.html', { state: admin });
  try {
    await page.waitForSelector('#adminLayout.visible');
    await page.click('[data-panel="storefrontPanel"]');
    await page.waitForSelector('.admin-slide-editor');
    await page.fill('#content-slides-0-title', 'Changed title');
    await page.evaluate(() => { window.__failContentSave = 'Network unavailable'; });
    await page.click('#saveStorefront');
    await page.waitForFunction(() => document.querySelector('#storefrontStatus').textContent.includes('Images were not saved'));
    assert.equal(await page.inputValue('#content-slides-0-title'), 'Changed title');
    assert.equal(await page.locator('#saveStorefront').isEnabled(), true);
    await page.evaluate(() => { window.__failContentSave = 'CONTENT_CONFLICT: newer content'; });
    await page.click('#saveStorefront');
    await page.waitForFunction(() => document.querySelector('#storefrontStatus').textContent.includes('Another administrator'));
    assert.equal(await page.inputValue('#content-slides-0-title'), 'Changed title');
    await page.evaluate(() => { window.LuxeStorage.uploadProductImage = async () => ({ url: null, error: { message: 'Upload offline' } }); });
    await page.locator('#content-slides-0-file').setInputFiles({ name: 'image.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('fake-image-for-uploader-boundary') });
    await page.waitForFunction(() => document.querySelector('#storefrontStatus').textContent.includes('Upload failed'));
    assert.equal(await page.inputValue('#content-slides-0-image'), 'assets/products/ijele.jpg');
    await page.evaluate(() => { window.LuxeStorage.uploadProductImage = async () => ({ url: 'https://images.example.com/upload.jpg', error: null }); });
    await page.locator('#content-slides-0-file').setInputFiles({ name: 'image.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('fake-image-for-uploader-boundary') });
    await page.waitForFunction(() => document.querySelector('#storefrontStatus').textContent.includes('Image uploaded'));
    assert.equal(await page.inputValue('#content-slides-0-image'), 'https://images.example.com/upload.jpg');
    assert.equal(await page.locator('#saveStorefront').isEnabled(), true);
    await page.click('[data-slide-action="remove"][data-slide-index="2"]');
    await page.click('[data-slide-action="remove"][data-slide-index="1"]');
    assert.equal(await page.locator('[data-slide-action="remove"]').isDisabled(), true);
    await page.evaluate(() => { window.__failContentSave = null; });
    await page.click('#saveStorefront');
    await page.waitForFunction(() => document.querySelector('#storefrontStatus').textContent.startsWith('Images saved.'));
    await page.goto(fixture.base + '/index.html');
    await page.waitForFunction(() => document.querySelector('#culturePieceName').textContent === 'Changed title');
    assert.equal(await page.locator('.culture-piece-select button').count(), 1);
    assert.equal(await page.locator('.culture-piece-select button').getAttribute('aria-pressed'), 'true');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('ordinary accounts cannot open the admin editor or request audience data', async () => {
  const { page, context, errors } = await fixture.openPage('admin.html', { state: { __auditUser: admin.__auditUser } });
  try {
    await page.waitForSelector('#adminDeniedGate', { state: 'visible' });
    assert.equal(await page.locator('#adminLayout').isVisible(), false);
    assert.equal(await page.evaluate(() => window.__requests.some(request => ['admin_audience_metrics_v1', 'get_storefront_content_v1'].includes(request.rpc))), false);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
