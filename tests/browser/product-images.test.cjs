const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const {startFixture} = require('./fixture.cjs');
let app;
before(async () => { app = await startFixture(); });
after(async () => { await app?.close(); });

async function assertPhoto(image, label) {
  await image.scrollIntoViewIfNeeded();
  await image.page().waitForFunction(image => image.complete && image.naturalWidth > 0, await image.elementHandle(), {timeout:8000});
  const state = await image.evaluate(image => {
    let opacity = 1, visible = true;
    for (let element = image; element; element = element.parentElement) {
      const style = getComputedStyle(element);
      opacity *= Number(style.opacity);
      visible &&= style.display !== 'none' && style.visibility === 'visible';
    }
    const box = image.getBoundingClientRect();
    return {src: image.currentSrc, naturalWidth: image.naturalWidth, placeholder: image.dataset.luxePlaceholderUsed === 'true', opacity, visible, width: box.width, height: box.height, loadingOverlay: !!image.closest('.is-image-loading')};
  });
  assert.match(state.src, /\/assets\/products\/(ijele|durbar|dun-dun)\.jpg$/, label + ': original photo');
  assert.ok(state.naturalWidth > 120, label + ': full photo, not a decoded placeholder');
  assert.equal(state.placeholder, false, label);
  assert.equal(state.loadingOverlay, false, label + ': no loader covering the photo');
  assert.ok(state.visible && state.opacity > .95 && state.width > 0 && state.height > 0, label + ': visible photo');
}

for (const localFile of [true, false]) {
  test(`shirts survive catalog hydration, rerenders and refresh in ${localFile ? 'file' : 'HTTP'} previews`, async () => {
    for (const route of ['men.html', 'women.html', 'shop.html']) {
      const {page, context, errors} = await app.openPage(route, {localFile, reducedMotion: 'no-preference', state: {__holdProducts: true, __fixture: []}});
      try {
        for (const image of await page.locator('.modern-piece-image img').all()) await assertPhoto(image, route + ': before catalog');
        await page.evaluate(() => { window.__holdProducts = false; window.__releaseProducts(); });
        await page.evaluate(() => window.productsReady);
        await page.waitForSelector('.modern-preview-piece .modern-piece-image img[data-luxe-original]');
        for (const image of await page.locator('.modern-piece-image img').all()) await assertPhoto(image, route + ': after catalog');
        await page.waitForTimeout(500);
        for (const image of await page.locator('.modern-piece-image img').all()) await assertPhoto(image, route + ': after load');
        await page.reload();
        await page.evaluate(() => { window.__holdProducts = false; window.__releaseProducts?.(); return window.productsReady; });
        for (const image of await page.locator('.modern-piece-image img').all()) await assertPhoto(image, route + ': after refresh');
        assert.deepEqual(errors, []);
      } finally { await context.close(); }
    }
  });

  test(`product, saved items, bag and checkout retain photos in ${localFile ? 'file' : 'HTTP'} previews`, async () => {
    const user = {id:'image-customer',email:'images@example.com',user_metadata:{full_name:'Image Customer'}};
    const order = {id:'image-order',order_number:'ALK-IMG',created_at:'2026-10-04',status:'processing',payment_status:'paid',payment_provider:'whatsapp',total:40,order_items:[{product_id:1001,product_name:'Ijele graphic tee',image_url:'assets/products/ijele.jpg',quantity:1,price:40}]};
    const {page, context, errors} = await app.openPage('product.html?piece=ijele', {localFile, reducedMotion: 'no-preference', state:{__auditUser:user,__auditOrders:[order]}, saved: {luxe_logged_in:true,luxe_user:user,['luxe_cart_user_'+user.id]: [{id:1001,quantity:1,size:'M',color:'Black'}], ['luxe_wishlist_user_'+user.id]:[1001]}});
    const navigate = async route => {
      await page.goto(new URL(route, page.url()).href);
      // Account history uses order snapshots; its inventory is loaded on demand.
      if (!route.startsWith('dashboard.html')) await page.waitForFunction(() => window.LuxeCatalogStatus.state === 'ready', null, {timeout:8000});
    };
    try {
      await page.waitForFunction(() => window.LuxeCatalogStatus.state === 'ready', null, {timeout:8000});
      await assertPhoto(page.locator('#productMainImageTrigger img'), 'product gallery');
      for (const image of await page.locator('#relatedProducts .modern-piece-image img').all()) await assertPhoto(image, 'related product');
      await page.locator('#productMainImageTrigger').click();
      await assertPhoto(page.locator('#productImageViewer img'), 'zoom');
      await page.keyboard.press('Escape');
      for (const route of ['wishlist.html', 'cart.html', 'checkout.html']) {
        await navigate(route);
        const images = page.locator('img[data-luxe-original]');
        await images.first().waitFor({state:'visible',timeout:8000}).catch(error => { error.message = route + ': ' + error.message; throw error; });
        assert.ok(await images.count() > 0, route + ': product photos present');
        for (const image of await images.all()) await assertPhoto(image, route);
      }
      await navigate('dashboard.html?tab=orders');
      await page.locator('.order-card img').first().waitFor({state:'visible'});
      await assertPhoto(page.locator('.order-card img').first(), 'account order');
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });
}

test('homepage product photos remain visible after inventory resolves with normal motion', async () => {
  const {page, context, errors} = await app.openPage('index.html', {width:1440, reducedMotion:'no-preference', state:{__fixture:[]}});
  try {
    await page.evaluate(() => window.productsReady);
    await page.waitForSelector('.modern-piece-grid .modern-shop-piece');
    const images = page.locator('.modern-piece-grid .modern-piece-image img');
    assert.equal(await images.count(), 3);
    for (const image of await images.all()) await assertPhoto(image, 'homepage collection');
    await page.locator('#cultureStage').scrollIntoViewIfNeeded();
    await page.waitForTimeout(1100);
    await assertPhoto(page.locator('#cultureShirt'), 'homepage artwork');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
