const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {startFixture}=require('./fixture.cjs');
let fixture;
before(async()=>{fixture=await startFixture();});
after(async()=>{await fixture?.close();});

test('editorial cursor responds to product imagery and yields to controls, keyboard and reduced motion',async()=>{
  const {page,context,errors}=await fixture.openPage('shop.html',{width:1440,reducedMotion:'no-preference'});
  try {
    const card=page.locator('.product-card[data-luxury-card]').first();
    await card.locator('.product-image').hover();
    await page.waitForFunction(()=>document.querySelector('.atelier-cursor')?.classList.contains('is-active'));
    assert.equal(await page.locator('.atelier-cursor').textContent(),'VIEW');
    await page.keyboard.press('Tab');
    assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('atelier-cursor-ready')),false);
    await card.locator('.product-image').hover();
    await page.locator('#sortBy').hover();
    assert.equal(await page.locator('.atelier-cursor').evaluate(el=>el.classList.contains('is-active')),false);
    await page.emulateMedia({reducedMotion:'reduce'});
    await card.locator('.product-image').hover();
    assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('atelier-cursor-ready')),false);
    assert.deepEqual(errors,[]);
  } finally {await context.close();}
});

test('editorial shop remains usable through tablet breakpoints and retains prominent purchase controls',async()=>{
  const {page,context,errors}=await fixture.openPage('shop.html',{width:1440});
  try {
    await page.waitForSelector('.product-card[data-luxury-card]');
    const first=await page.locator('.product-card').nth(0).boundingBox();
    const second=await page.locator('.product-card').nth(1).boundingBox();
    assert.ok(first.width>second.width*1.5,'The featured product should have a distinct scale');
    for(const width of [360,768,1020,1120]) {
      await page.setViewportSize({width,height:900});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      const card=page.locator('.product-card').first();
      assert.ok((await card.boundingBox()).width>=200,`Useful product size at ${width}px`);
      assert.equal(await card.locator('.product-name-link').isVisible(),true);
      assert.equal(await card.locator('.add-cart').isVisible(),true);
    }
    await page.locator('.product-card[data-id="1001"] .add-cart').click();
    await page.waitForURL('**/product.html?id=1001');
    await page.locator('.size-btn-product[data-size="L"]').click();
    await page.locator('#productAddToCart').click();
    await page.waitForFunction(()=>Number(document.querySelector('.cart-count').textContent)>0);
    assert.equal(await page.locator('.size-btn-product[data-size="L"]').getAttribute('aria-pressed'),'true');
    assert.deepEqual(errors,[]);
  } finally {await context.close();}
});
