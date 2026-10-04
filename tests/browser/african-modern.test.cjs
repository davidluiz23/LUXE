const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const AxeBuilder=require('@axe-core/playwright').default;
const {startFixture}=require('./fixture.cjs');
let fixture;
before(async()=>{fixture=await startFixture();});
after(async()=>{await fixture?.close();});

test('the approved campaign has independent drawing and model layers, real artwork, and no overflow',async()=>{
 const {page,context,errors}=await fixture.openPage('index.html',{width:1440,height:1000});
 try{
  await page.locator('.campaign-controls').waitFor({state:'visible'});
  await page.evaluate(()=>document.fonts.ready);
  assert.match(await page.locator('h1').textContent(),/AFRICAN EXPRESSION/);
  assert.equal(await page.locator('.modern-piece').count(),3);
  assert.equal(await page.locator('.campaign-pose').count(),3);
  assert.ok(await page.locator('[data-portrait-stroke]').count()>0);
  assert.equal(await page.locator('#campaignStage canvas').count(),0);
  assert.equal(await page.locator('.brand-wordmark').isVisible(),true);
  for(const [width,height] of [[320,568],[390,667],[667,375],[768,1024],[844,390],[1005,585],[1024,768],[1366,650],[1440,900],[1920,1080]]){
   await page.setViewportSize({width,height});
   const viewport=`${width}x${height}`;
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow at ${viewport}`);
   const h=await page.locator('h1').boundingBox();assert.ok(h.x>=0&&h.x+h.width<=width+1,`headline at ${viewport}`);
   const hero=await page.locator('.modern-hero').boundingBox();assert.ok(hero.y<120,'intro sits directly below navigation');
   assert.ok(hero.y+hero.height<=height,`hero fits the first viewport at ${viewport}`);
   for(const selector of ['.campaign-intro .modern-button','.campaign-controls']){
    const control=await page.locator(selector).boundingBox();
    assert.ok(control.y>=hero.y&&control.y+control.height<=height,`primary controls visible at ${viewport}`);
   }
   assert.equal(await page.locator('.campaign-intro .modern-button').evaluate(el=>{const b=el.getBoundingClientRect();return el.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2));}),true,`shop action unobscured at ${viewport}`);
  }
  await page.setViewportSize({width:390,height:900});
  const audit=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
  assert.deepEqual(audit.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})),[]);
  assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

test('manual poses decode before committing, stop autoplay, and recover from failed images',async()=>{
 const {page,context,errors}=await fixture.openPage('index.html',{width:1440});
 try{
  await page.locator('[data-pose-next]').click();
  await page.waitForFunction(()=>document.querySelector('#campaignStage').dataset.pose==='1');
  assert.equal(await page.locator('.campaign-pose.is-active').evaluate(i=>i.complete&&i.naturalWidth>0),true);
  assert.equal(await page.locator('#campaignStage').getAttribute('data-playback'),'paused');
  assert.equal(await page.locator('[data-pose-select="1"]').getAttribute('aria-pressed'),'true');
  await context.route('**/pose-03-*.webp',r=>r.abort());
  await page.locator('[data-pose-next]').click();
  await page.waitForFunction(()=>document.querySelector('#campaignStatus').textContent.includes('could not load'));
  assert.equal(await page.locator('#campaignStage').getAttribute('data-pose'),'1');
  assert.equal(await page.locator('[data-pose-image="1"]').isVisible(),true);
  await context.unroute('**/pose-03-*.webp');
  await page.locator('[data-pose-prev]').click();
  await page.waitForFunction(()=>document.querySelector('#campaignStage').dataset.pose==='0');
  assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

test('the portrait draws again after refresh, autoplay pauses offscreen, and reduced motion cleans up',async()=>{
 const {page,context,errors}=await fixture.openPage('index.html',{width:1440,reducedMotion:'no-preference'});
 try{
  await page.mouse.move(1,1);
  await context.addInitScript(()=>{window.__portraitStates=[];new MutationObserver(records=>{for(const r of records)if(r.target.id==='campaignStage')window.__portraitStates.push(r.target.getAttribute('data-drawing'));}).observe(document,{subtree:true,attributes:true,attributeFilter:['data-drawing']});});
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__portraitStates.includes('drawing'));
  assert.equal(await page.locator('html').getAttribute('data-modern-motion'),'ready');
  await page.waitForFunction(()=>document.querySelector('#campaignStage').dataset.drawing==='complete');
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__portraitStates.includes('drawing'));
  await page.waitForFunction(()=>document.querySelector('#campaignStage').dataset.pose!=='0',{},{timeout:30000});
  await page.locator('.modern-care').scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>document.querySelector('#campaignStage').dataset.playback==='paused');
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.waitForFunction(()=>!document.documentElement.hasAttribute('data-modern-motion'));
  assert.equal(await page.locator('html').evaluate(el=>el.classList.contains('lenis')),false);
  assert.equal(await page.locator('#campaignStage').getAttribute('data-drawing'),'complete');
  assert.equal(await page.locator('[data-portrait-stroke]').first().evaluate(el=>Number.parseFloat(getComputedStyle(el).strokeDashoffset)),0);
  assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

test('artwork commits its image, title and real product link together and handles keyboard selection',async()=>{
 const {page,context,errors}=await fixture.openPage('index.html',{width:1440});
 try{
  await page.waitForFunction(()=>document.querySelector('[data-piece-link="ijele"]').getAttribute('href')==='product.html?id=1001');
  await page.locator('[data-piece="durbar"]').click();
  await page.waitForFunction(()=>document.querySelector('#cultureStage').dataset.selected==='durbar');
  assert.match(await page.locator('#cultureShirt').getAttribute('src'),/durbar.jpg$/);
  assert.equal(await page.locator('#culturePieceName').textContent(),'Durbar');
  assert.equal(await page.locator('#cultureStage [data-piece-link]').getAttribute('href'),'product.html?id=1002');
  await page.keyboard.press('End');
  await page.waitForFunction(()=>document.querySelector('#cultureStage').dataset.selected==='dun-dun');
  assert.equal(await page.locator('[data-piece="dun-dun"]').evaluate(el=>el===document.activeElement),true);
  await page.evaluate(()=>{const original=window.LuxeSiteContent.snapshot().content;original.slides[0].image='assets/products/intentionally-unavailable.jpg';window.LuxeSiteContent.snapshot=()=>({content:original});window.dispatchEvent(new Event('luxe:site-content'));});
  await page.keyboard.press('Home');
  await page.waitForFunction(()=>document.querySelector('#culturePieceStatus').textContent.includes('could not load'));
  assert.equal(await page.locator('#cultureStage').getAttribute('data-selected'),'dun-dun');
  assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

test('static campaign, story and collection navigation remain complete without JavaScript',async()=>{
 for(const name of ['index.html','about.html']){
  const {page,context,errors}=await fixture.openPage(name,{width:390,javaScriptEnabled:false});
  try{
   assert.equal(await page.locator('h1').isVisible(),true);
   assert.ok(await page.locator('main a[href="shop.html"]').count()>0);
   assert.equal(await page.locator('footer[data-modern-footer]').count(),1);
   assert.equal(await page.locator('nav.modern-noscript-nav').isVisible(),true);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   if(name==='index.html')assert.equal(await page.locator('.campaign-pose.is-active').evaluate(i=>i.complete&&i.naturalWidth>0),true);
   assert.deepEqual(errors,[]);
  }finally{await context.close();}
 }
});

test('menu and search retain keyboard focus with motion active and missing observers',async()=>{
 const {page,context,errors}=await fixture.openPage('index.html',{width:390,reducedMotion:'no-preference',state:{__disableIntersectionObserver:true}});
 try{
  await page.locator('#hamburger').click();await page.locator('#mobileMenu').waitFor({state:'visible'});
  await page.keyboard.press('Escape');assert.equal(await page.locator('#hamburger').evaluate(el=>el===document.activeElement),true);
  await page.locator('#searchToggle').click();await page.locator('#headerSearchInput').fill('Ijele');
  await page.locator('.search-result-item').first().waitFor();
  await page.keyboard.press('Escape');assert.equal(await page.locator('#searchToggle').evaluate(el=>el===document.activeElement),true);
  assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
