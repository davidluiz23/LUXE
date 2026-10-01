const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {startFixture}=require('./fixture.cjs');
let fixture;
before(async()=>{fixture=await startFixture();});
after(async()=>{await fixture?.close();});
const catalog=['Ijele','Durbar','Dùn Dùn'].map((name,i)=>({id:501+i,name:name+' graphic tee',brand:'ALKEBULAN',category:'Men',price:60+i*10,price_ngn:90000+i*15000,image:'assets/products/ijele.jpg',in_stock:true,stock_quantity:5,sizes:[],colors:[]}));
async function select(page,id,title){
  await page.click(`[data-world-artwork="${id}"]`);
  await page.waitForFunction(name=>document.querySelector('#worldArtworkName').textContent===name,title);
}
test('gallery artwork stays shoppable without inventing catalog IDs or prices',async()=>{
  const {page,context,errors}=await fixture.openPage('index.html');
  try{
    await page.waitForSelector('#worldArtworkSelector:not([hidden])');
    for(const [id,title] of [['ijele','Ijele'],['durbar','Durbar'],['dun-dun','Dùn Dùn']]){
      await select(page,id,title);
      assert.equal(await page.locator('#worldArtworkLink').getAttribute('href'),'shop.html');
      assert.equal(await page.locator('#worldArtworkPrice').isHidden(),true);
      assert.match(await page.locator('#worldArtworkImage').getAttribute('src'),new RegExp(id+'\\.jpg$'));
    }
    assert.deepEqual(errors,[]);
  }finally{await context.close();}
});
test('selection keeps real product destinations and both currencies together',async()=>{
  const {page,context,errors}=await fixture.openPage('index.html',{state:{__fixture:catalog}});
  try{
    await page.waitForFunction(()=>document.querySelector('#worldArtworkLink').getAttribute('href').includes('id='));
    for(const [index,id,title] of [[0,'ijele','Ijele'],[1,'durbar','Durbar'],[2,'dun-dun','Dùn Dùn']]){
      await select(page,id,title);
      assert.equal(await page.locator('#worldArtworkLink').getAttribute('href'),'product.html?id='+(501+index));
      assert.match(await page.locator('#worldArtworkPrice').textContent(),/₦/);
      assert.match(await page.locator('#worldArtworkPrice').textContent(),/\$/);
    }
    assert.deepEqual(errors,[]);
  }finally{await context.close();}
});
test('ambiguous names and unavailable catalogs cannot bind unrelated products',async()=>{
  for(const state of [{__fixture:[...catalog,{...catalog[0],id:999},{...catalog[1],id:998,brand:'Another brand'}]},{__failProducts:true}]){
    const {page,context,errors}=await fixture.openPage('index.html',{state});
    try{
      await page.waitForSelector('#worldArtworkSelector:not([hidden])'); await select(page,'ijele','Ijele');
      assert.equal(await page.locator('#worldArtworkLink').getAttribute('href'),'shop.html');
      assert.equal(await page.locator('#worldArtworkPrice').isHidden(),true);
      assert.equal(await page.locator('#worldArtworkSelector button').count(),3);
      assert.deepEqual(errors,[]);
    }finally{await context.close();}
  }
});
test('artwork responds to arrow keys, Home and End with persistent keyboard focus',async()=>{
  const {page,context,errors}=await fixture.openPage('index.html',{width:390,height:844});
  try{
    await page.locator('[data-world-artwork="ijele"]').focus();await page.keyboard.press('ArrowRight');
    await page.waitForFunction(()=>document.querySelector('#worldArtworkName').textContent==='Durbar');
    assert.equal(await page.locator('[data-world-artwork="durbar"]').evaluate(e=>e===document.activeElement),true);
    await page.keyboard.press('End');await page.waitForFunction(()=>document.querySelector('#worldArtworkName').textContent==='Dùn Dùn');
    await page.keyboard.press('Home');await page.waitForFunction(()=>document.querySelector('#worldArtworkName').textContent==='Ijele');
    assert.deepEqual(errors,[]);
  }finally{await context.close();}
});
test('responsive navigation and the footer retain store and account routes',async()=>{
  const {page,context,errors}=await fixture.openPage('index.html');
  try{
    for(const width of [320,390,768,1440,2560]){
      await page.setViewportSize({width,height:900});
      const logo=await page.locator('.logo a').boundingBox(),controls=await page.locator('.nav-icons').boundingBox();
      assert.ok(logo.x+logo.width<=controls.x+1,`Logo overlaps controls at ${width}`);
      for(const selector of ['#searchToggle','.cart-icon','.notification-icon','#hamburger']){
        const box=await page.locator(selector).boundingBox();
        assert.ok(box&&box.width>=44&&box.height>=44,`${selector} touch target at ${width}`);
        assert.ok(box.x>=0&&box.x+box.width<=width,`${selector} bounds at ${width}`);
      }
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    }
    await page.click('#hamburger');await page.waitForSelector('#mobileMenu',{state:'visible'});
    await page.keyboard.press('Escape');await page.waitForSelector('#mobileMenu',{state:'hidden'});
    assert.equal(await page.locator('#hamburger').evaluate(e=>e===document.activeElement),true);
    for(const href of ['shop.html','about.html','dashboard.html','shipping.html','returns.html','faq.html','privacy.html','terms.html','contact.html'])assert.ok(await page.locator(`footer a[href="${href}"]`).count(),href);
    assert.deepEqual(errors,[]);
  }finally{await context.close();}
});
test('homepage account links resolve to the signed-in customer',async()=>{
  const {page,context,errors}=await fixture.openPage('index.html',{width:1440,state:{__auditUser:{id:'home-customer',email:'customer@example.com'}}});
  try{
    await page.waitForFunction(()=>document.querySelector('.user-icon').getAttribute('href')==='dashboard.html');
    assert.equal(await page.locator('.notification-icon').getAttribute('href'),'dashboard.html?tab=notifications');
    await page.click('.notification-icon');await page.waitForURL('**/dashboard.html?tab=notifications');
    assert.deepEqual(errors,[]);
  }finally{await context.close();}
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


