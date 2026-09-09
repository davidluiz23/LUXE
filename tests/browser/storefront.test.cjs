const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { AxeBuilder } = require('@axe-core/playwright');
const { startFixture } = require('./fixture.cjs');
let fixture;
before(async () => { fixture = await startFixture(); });
after(async () => { await fixture?.close(); });
const user = { id: 'customer-1', email: 'customer@example.com', user_metadata: { full_name: 'Audit Customer' } };
const cartKey = 'luxe_cart_user_customer-1';
const selected = [{ id: 1001, quantity: 2, size: 'M', color: 'Black' }];

test('all pages load at desktop and mobile widths with accessible visible controls', async t => {
  for (const width of [1440, 390]) {
    for (const name of fixture.pages.filter(name => !process.env.AUDIT_PAGES || process.env.AUDIT_PAGES.split(',').includes(name))) {
      await t.test(`${name} at ${width}px`, async () => {
        const { page, context, errors } = await fixture.openPage(name + (name === 'product.html' ? '?id=1001' : ''), {width});
        try {
          await page.waitForTimeout(400);
          assert.deepEqual(errors, []);
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'horizontal page overflow');
          const result = await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
          if (result.violations.length) t.diagnostic(JSON.stringify({name,width,violations:result.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,detail:n.failureSummary}))}))}));
          assert.deepEqual(result.violations.map(v => ({id:v.id, targets:v.nodes.map(n=>n.target), detail:v.nodes[0]?.failureSummary})), []);
        } finally { await context.close(); }
      });
    }
  }
});

test('search on an informational page fetches the live catalog on demand', async () => {
  const {page,context,errors} = await fixture.openPage('about.html');
  try {
    assert.equal(await page.evaluate(() => __requests.some(r=>r.table==='products')), false);
    await page.click('#searchToggle');
    await page.fill('#headerSearchInput', 'Audit');
    await page.waitForSelector('.search-result-item');
    assert.equal(await page.locator('.search-result-item').count(), 8);
    assert.match(await page.locator('.search-result-item').first().getAttribute('href'), /id=1001/);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#headerSearchModal').isHidden(), true);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('failed catalog search explains the outage and retries when reopened', async () => {
  const {page,context} = await fixture.openPage('contact.html', {state:{__failProducts:true}});
  try {
    await page.click('#searchToggle');
    await page.fill('#headerSearchInput', 'Audit');
    await page.waitForFunction(() => document.querySelector('#headerSearchResults').textContent.includes('temporarily unavailable'));
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.__failProducts = false);
    await page.click('#searchToggle');
    await page.fill('#headerSearchInput', 'Audit');
    await page.waitForSelector('.search-result-item');
  } finally { await context.close(); }
});

test('checkout prevents navigation while its secure total is loading', async () => {
  const {page,context,errors} = await fixture.openPage('checkout.html', {state:{__auditUser:user,__holdQuote:true},saved:{[cartKey]:selected}});
  try {
    await page.waitForFunction(() => typeof window.__releaseQuote === 'function');
    assert.equal(await page.locator('.checkout-btn').isDisabled(), true);
    assert.equal(await page.evaluate(() => {
      const event = new Event('submit', {bubbles:true,cancelable:true});
      document.querySelector('#checkoutForm').dispatchEvent(event);
      return event.defaultPrevented;
    }), true);
    await page.evaluate(() => { window.__holdQuote=false; window.__releaseQuote(); });
    await page.waitForFunction(() => !document.querySelector('.checkout-btn').disabled);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('order-history failure shows recovery instead of an empty account', async () => {
  const {page,context,errors} = await fixture.openPage('dashboard.html?tab=orders', {state:{__auditUser:user,__failOrders:true}});
  try {
    await page.waitForSelector('[data-reload-orders]');
    assert.match(await page.locator('#ordersList').textContent(), /could not be loaded/);
    assert.doesNotMatch(await page.locator('#ordersList').textContent(), /haven't placed/);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('a failed mark-read save leaves notifications unread', async () => {
  const notifications = [{id:'note-1',title:'Order received',message:'Your order is saved.',created_at:'2026-01-01',read_at:null}];
  const {page,context,errors} = await fixture.openPage('dashboard.html?tab=notifications', {state:{__auditUser:user,__failNotificationWrite:true,__auditNotifications:notifications}});
  try {
    await page.waitForSelector('.dashboard-notification.is-unread');
    assert.equal(await page.locator('#notificationBadge').textContent(), '1');
    assert.match(await page.locator('#paymentBanner').textContent(), /could not be marked/);
    await page.click('#markAllNotificationsRead');
    assert.equal(await page.locator('.dashboard-notification.is-unread').count(), 1);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('payment returns preserve new cart additions and are safe to revisit', async () => {
  const order = {id:'paid-order',order_number:'ALK-0001',created_at:'2026-01-01',status:'processing',payment_status:'paid',total:80,
    order_items:[{product_id:1001,product_name:'Audit shirt',quantity:2,price:40,selected_size:'M',selected_color:'Black'}]};
  const contents = [{...selected[0],quantity:3},{id:1002,quantity:1}];
  const {page,context,errors} = await fixture.openPage('dashboard.html?payment=return&reference=ref-1', {state:{__auditUser:user,__auditOrders:[order]},saved:{[cartKey]:contents}});
  try {
    await page.waitForFunction(() => document.querySelector('#paymentBanner').textContent.includes('Payment confirmed'));
    const after = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), cartKey);
    assert.equal(after.length, 2);
    assert.equal(after[0].quantity, 1);
    await page.goto(fixture.base+'/dashboard.html?payment=return&reference=ref-1');
    await page.waitForFunction(() => document.querySelector('#paymentBanner').textContent.includes('Payment confirmed'));
    assert.deepEqual(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),cartKey),after);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('unavailable product pages stop their related-product loading state', async () => {
  const {page,context} = await fixture.openPage('product.html?id=99999');
  try {
    await page.waitForFunction(()=>document.querySelector('#productDetails').textContent.includes('Product not found'));
    assert.equal(await page.locator('#relatedProducts').getAttribute('aria-busy'), 'false');
    assert.equal(await page.locator('.product-card-skeleton').count(),0);
  } finally { await context.close(); }
});

test('closed mobile menus are inert and opening/closing restores keyboard focus', async () => {
  for(const name of ['shop.html','admin.html']) {
    const {page,context} = await fixture.openPage(name);
    try {
      assert.equal(await page.locator('#mobileMenu').evaluate(menu=>menu.inert),true);
      await page.click('#hamburger');
      assert.equal(await page.locator('#mobileMenu').evaluate(menu=>menu.inert),false);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#mobileMenu').evaluate(menu=>menu.inert),true);
      assert.equal(await page.evaluate(()=>document.activeElement.id),'hamburger');
    } finally { await context.close(); }
  }
});

test('opening navigation hides the page scrollbar and restores page scrolling on close', async () => {
  for (const [name,width,height] of [['shop.html',390,600],['shop.html',900,540],['admin.html',390,320]]) {
    const {page,context,errors}=await fixture.openPage(name,{width});
    try {
      await page.setViewportSize({width,height});
      await page.evaluate(()=>{document.documentElement.style.scrollBehavior='auto';window.scrollTo(0,100);});
      const originalPosition=await page.evaluate(()=>window.scrollY);
      assert.ok(originalPosition>0,`${name}: fixture needs a scrollable page`);
      await page.click('#hamburger');
      await page.waitForTimeout(650);
      assert.equal(await page.evaluate(()=>document.documentElement.clientWidth===innerWidth),true,`${name}: the background page scrollbar remains visible`);
      const menu=page.locator('#mobileMenu');
      const menuOverflows=await menu.evaluate(element=>element.scrollHeight>element.clientHeight);
      if(name==='shop.html') assert.equal(menuOverflows,true,'The storefront fixture needs an overflowing menu');
      await page.mouse.move(width/2,height/2);
      await page.mouse.wheel(0,200);
      if(menuOverflows) await page.waitForFunction(()=>document.getElementById('mobileMenu').scrollTop>0);
      else await page.waitForTimeout(200);
      assert.equal(await page.evaluate(()=>window.scrollY),originalPosition,`${name}: opening or scrolling the menu moved the page`);
      await page.keyboard.press('Escape');
      assert.equal(await page.evaluate(()=>window.scrollY),originalPosition,`${name}: closing the menu lost the page position`);
      await page.waitForTimeout(650);
      await page.mouse.wheel(0,100);
      await page.waitForFunction(previous=>window.scrollY>previous,originalPosition);
      assert.deepEqual(errors,[]);
    } finally {await context.close();}
  }
});

test('signup from checkout preserves the destination through email verification', async () => {
  const {page,context,errors} = await fixture.openPage('login.html?returnTo=checkout.html');
  try {
    await page.click('.auth-switch a');
    assert.match(page.url(), /signup.html\?returnTo=checkout.html/);
    await page.waitForFunction(() => typeof window.LuxeAuth?.requestSignupVerification === 'function');
    await page.evaluate(() => { window.LuxeAuth.requestSignupVerification = async () => ({data:{ok:true},error:null}); });
    await page.fill('#fullName','Audit Customer');
    await page.fill('#email','customer@example.com');
    await page.check('#terms');
    await page.click('#signupForm button[type="submit"]');
    await page.waitForURL('**/verify-signup.html?returnTo=checkout.html');
    await page.waitForFunction(() => typeof window.LuxeAuth?.completeSignupWithCode === 'function');
    await page.evaluate(customer => {
      window.LuxeAuth.checkSignupCode = async () => ({data:{valid:true},error:null});
      window.LuxeAuth.completeSignupWithCode = async () => ({data:{ok:true,email:customer.email},error:null});
      window.LuxeAuth.signInWithPassword = async () => ({data:{user:customer},error:null});
    },user);
    await page.fill('#signupVerificationCode','123456');
    await page.click('#verifySignupCodeBtn');
    await page.fill('#signupPassword','test-only-password');
    await page.fill('#signupConfirmPassword','test-only-password');
    await page.click('#finishSignupBtn');
    await page.waitForURL('**/checkout.html');
    assert.deepEqual(errors,[]);
  } finally { await context.close(); }
});

test('admin password-reset failure stays recoverable and the dialog restores focus', async () => {
  const {page,context,errors} = await fixture.openPage('admin.html');
  try {
    await page.click('#adminForgotPasswordLink');
    await page.evaluate(() => { window.LuxeAuth.requestPasswordReset = async () => ({error:{message:'Provider unavailable'}}); });
    await page.fill('#adminResetEmail','admin@example.com');
    await page.click('#adminResetSubmitBtn');
    assert.equal(await page.locator('#adminResetForm').isVisible(),true);
    assert.match(await page.locator('#adminResetStatus').textContent(),/could not request/);
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(()=>document.activeElement.id),'adminForgotPasswordLink');
    assert.deepEqual(errors,[]);
  } finally { await context.close(); }
});

test('authorized admin panels and product options remain usable', async () => {
  for (const width of [1440,390]) {
    const {page,context,errors} = await fixture.openPage('admin.html',{width,state:{__auditUser:user,__auditRole:'owner'}});
    try {
      await page.waitForSelector('#adminLayout.visible');
      for(const button of await page.locator('.admin-nav-btn[data-panel]').all()) {
        if (!await button.isVisible()) continue;
        const panel = await button.getAttribute('data-panel');
        await button.click();
        await page.waitForSelector(`#${panel}.active`);
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${panel} at ${width}px overflows`);
        const audit=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
        assert.deepEqual(audit.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})),[],`${panel} at ${width}px`);
      }
      assert.deepEqual(errors,[]);
    } finally { await context.close(); }
  }
  const product = await fixture.openPage('product.html?id=1001');
  try {
    await product.page.waitForSelector('.size-btn-product');
    await product.page.click('.size-btn-product[data-size="L"]');
    await product.page.click('.color-btn[data-color="White"]');
    await product.page.evaluate(()=>window.addToCartHandler(1001));
    const items=await product.page.evaluate(()=>window.loadCart());
    assert.equal(items[0].size,'L');
    assert.equal(items[0].color,'White');
    assert.deepEqual(product.errors,[]);
  } finally {await product.context.close();}
});

test('pending payments can be retried from My Orders without creating another order', async () => {
  const order={id:'pending-order',order_number:'ALK-0002',created_at:'2026-01-01',status:'awaiting_payment',payment_status:'pending',payment_provider:'paystack',total:80,order_items:[]};
  const {page,context,errors}=await fixture.openPage('dashboard.html?tab=orders',{state:{__auditUser:user,__auditOrders:[order]}});
  try {
    await page.waitForSelector('[data-resume-payment]');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.click('[data-resume-payment]');
    await page.waitForFunction(()=>document.querySelector('#paymentBanner').textContent.includes('Payment could not be opened'));
    assert.equal(await page.locator('[data-resume-payment]').isEnabled(),true);
    const requests=await page.evaluate(()=>__requests);
    assert.equal(requests.filter(r=>r.function==='payment-gateway'&&r.body.action==='initialize').length,1);
    assert.equal(requests.some(r=>r.rpc==='create_order_secure_v3'),false);
    assert.deepEqual(errors,[]);
  } finally {await context.close();}
});
