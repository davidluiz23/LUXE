const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startFixture } = require('./fixture.cjs');
let fixture;
before(async () => { fixture = await startFixture(); });
after(async () => { await fixture?.close(); });

test('a delayed presentation script cannot flash the old navbar or block the page', async () => {
  for (const name of ['index.html', 'shop.html']) {
    for (const width of [390, 1440]) {
      const { page, context, errors } = await fixture.openPage(name, { width });
      let release;
      const gate = new Promise(resolve => { release = resolve; });
      try {
        const requested = [];
        page.on('request', request => { if (['stylesheet', 'font'].includes(request.resourceType())) requested.push(request.url()); });
        await context.route('**/js/luxury-ui.js*', async route => { await gate; await route.continue(); });
        await page.goto(`${fixture.base}/${name}`, { waitUntil: 'commit' });
        await page.waitForSelector('#navbar.luxury-navbar');
        await page.evaluate(() => document.fonts.ready);
        assert.equal(await page.locator('#loader').count(), 0);
        assert.equal(await page.locator('body').evaluate(body => body.classList.contains('luxury-ready')), false);
        const before = await page.locator('#navbar').boundingBox();
        assert.ok(before.x > 0 && before.width < width, `${name}: initial header must float`);
        assert.equal(await page.locator('#navbar .nav-links a').count(), 6);
        assert.equal(await page.locator('#searchToggle svg').isVisible(), true, `${name} at ${width}: initial search icon is missing`);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${name} at ${width}: initial content overflows`);
        release();
        await page.waitForFunction(() => document.body.classList.contains('luxury-ready'));
        assert.deepEqual(await page.locator('#navbar').boundingBox(), before, `${name} at ${width}: presentation initialization moved the header`);
        assert.ok(requested.every(url => url.startsWith(fixture.base)), 'styles and fonts must not wait on a third-party CDN');
        assert.deepEqual(errors, []);
      } finally { release(); await context.close(); }
    }
  }
});
