const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startFixture } = require('./fixture.cjs');
let fixture;
before(async () => { fixture = await startFixture(); });
after(async () => { await fixture?.close(); });

test('an empty curated catalog shows the original artwork without invented prices or stock',async()=>{
  const {page,context,errors}=await fixture.openPage('shop.html',{width:390,state:{__holdProducts:true}});
  try{
    await page.waitForFunction(()=>typeof window.__releaseProducts==='function');
    await page.evaluate(()=>{window.__fixture=window.__fixture.filter(p=>p.brand!=='ALKEBULAN');window.__holdProducts=false;window.__releaseProducts();});
    await page.locator('#intendedPreview').waitFor({state:'visible'});
    assert.equal(await page.locator('#intendedPreview .modern-piece').count(),3);
    assert.equal(await page.locator('.shop-section').isHidden(),true);
    assert.equal(await page.locator('#catalogStatusBanner').count(),0);
    assert.equal(await page.locator('#intendedPreview a[href^="product.html"]').count(),0);
    assert.equal(await page.locator('#intendedPreview .modern-piece-price').first().textContent(),'Graphic tee');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:'artifacts/african-modern/collection-awaiting-inventory.jpg',fullPage:true,type:'jpeg',quality:80});
    assert.deepEqual(errors,[]);
  }finally{await context.close();}
});

test('public listings and search exclude legacy rows while the authenticated admin retains them', async () => {
  const { page, context, errors } = await fixture.openPage('shop.html', { width: 1440 });
  try {
    await page.waitForSelector('.product-card[data-id="1001"]');
    assert.deepEqual(await page.locator('.product-card[data-id]').evaluateAll(cards => cards.map(card => Number(card.dataset.id)).sort()), [1001, 1002, 1003]);
    assert.equal(await page.locator('.product-card').filter({ hasText: 'Retired' }).count(), 0);
    await page.click('#searchToggle');
    await page.fill('#headerSearchInput', 'Retired');
    await page.waitForFunction(() => document.querySelector('#headerSearchResults').textContent.includes('No pieces found'));
    assert.equal(await page.locator('.search-result-item').count(), 0);
    await page.fill('#headerSearchInput', 'Durbar');
    await page.waitForSelector('.search-result-item');
    assert.equal(await page.locator('.search-result-item').count(), 1);
    assert.match(await page.locator('.search-result-item').getAttribute('href'), /id=1002$/);
    await page.goto(fixture.base + '/product.html?id=1004');
    await page.waitForFunction(() => document.querySelector('#productDetails').textContent.includes('Product not found'));
    assert.match(await page.locator('#productDetails').textContent(), /Product not found/);
    assert.equal(await page.locator('#productAddToCart').count(), 0);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }

  const admin = await fixture.openPage('admin.html', { width: 1440, state: { __auditUser: { id: 'catalog-owner', email: 'owner@example.com' }, __auditRole: 'owner' } });
  try {
    await admin.page.waitForSelector('#adminLayout.visible');
    await admin.page.click('[data-panel="productsPanel"]');
    await admin.page.waitForSelector('.edit-product-btn[data-id="1004"]');
    assert.equal(await admin.page.locator('.edit-product-btn').count(), 16);
    assert.equal(await admin.page.locator('.edit-product-btn[data-id="1004"]').isVisible(), true);
    assert.deepEqual(admin.errors, []);
  } finally { await admin.context.close(); }
});

test('saved bags and wishlists retire unrelated items only after a successful catalog load', async () => {
  const user = { id: 'collection-customer', email: 'customer@example.com' };
  const cartKey = 'luxe_cart_user_collection-customer';
  const wishKey = 'luxe_wishlist_user_collection-customer';
  const saved = {
    luxe_logged_in: true, luxe_user: user,
    [cartKey]: [{ id: 1002, quantity: 1 }, { id: 1004, quantity: 1 }],
    [wishKey]: [1002, 1004],
  };
  const { page, context, errors } = await fixture.openPage('cart.html', { state: { __auditUser: user }, saved });
  try {
    await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).length === 1, cartKey);
    assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).map(item => item.id), cartKey), [1002]);
    assert.equal(await page.evaluate(() => window.addToCart(1004)), false);
    await page.goto(fixture.base + '/wishlist.html');
    await page.waitForSelector('.wishlist-item[data-id="1002"]');
    assert.equal(await page.locator('.wishlist-item[data-id="1004"]').count(), 0);
    assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), wishKey), [1002]);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
  const offline = await fixture.openPage('cart.html', { state: { __auditUser: user, __failProducts: true }, saved });
  try {
    await offline.page.waitForFunction(() => window.LuxeCatalogStatus.state === 'unavailable');
    assert.equal(await offline.page.evaluate(key => JSON.parse(localStorage.getItem(key)).length, cartKey), 2);
    await offline.page.goto(fixture.base + '/wishlist.html');
    await offline.page.waitForFunction(() => window.LuxeCatalogStatus.state === 'unavailable');
    assert.deepEqual(await offline.page.evaluate(key => JSON.parse(localStorage.getItem(key)), wishKey), [1002, 1004]);
    assert.deepEqual(offline.errors, []);
  } finally { await offline.context.close(); }
});
