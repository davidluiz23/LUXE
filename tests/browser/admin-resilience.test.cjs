const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startFixture } = require('./fixture.cjs');
let fixture;
before(async () => { fixture = await startFixture(); });
after(async () => { await fixture?.close(); });
const admin = { __auditUser: { id: 'admin-audit', email: 'admin@example.com' }, __auditRole: 'owner' };

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
