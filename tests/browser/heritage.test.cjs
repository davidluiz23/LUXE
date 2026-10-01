const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const AxeBuilder=require('@axe-core/playwright').default;
const {startFixture}=require('./fixture.cjs');
let fixture;
before(async()=>{fixture=await startFixture();});
after(async()=>{await fixture?.close();});
const ready=page=>page.waitForFunction(()=>document.querySelector('#scrollWorld').dataset.worldState==='ready',null,{timeout:60000});
async function go(page,id){
  await page.evaluate(id=>scrollTo({top:document.getElementById(id).getBoundingClientRect().top+scrollY,behavior:'instant'}),id);
  await page.waitForFunction(index=>{const s=window.__alkWorld.stats();return Math.abs(s.exact-index)<.001&&Math.abs(s.exact-s.smooth)<.0001;},['heritage','form','expression','collection'].indexOf(id));
}
test('four chapters remain accessible in reduced motion without downloading WebGL',async()=>{
  const {page,context,errors}=await fixture.openPage('index.html?world-debug');
  try{
    for(const [width,height] of [[1440,900],[768,1024],[390,844]]){
      await page.setViewportSize({width,height});
      for(const id of ['heritage','form','expression','collection']){
        await page.locator('#'+id).scrollIntoViewIfNeeded();
        assert.equal(await page.locator('#'+id+' :is(h1,h2)').isVisible(),true);
      }
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
      assert.deepEqual(result.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})),[]);
    }
    assert.equal(await page.locator('.world-canvas').count(),0);
    assert.equal(await page.evaluate(()=>performance.getEntriesByType('resource').some(r=>/renderer-|terracotta-study\.glb/.test(r.name))),false);
    assert.equal(await page.locator('.world-poster img').evaluate(e=>e.naturalWidth>0),true);
    assert.deepEqual(errors,[]);
  }finally{await context.close();}
});
test('one world survives reverse travel, inspection, resizing and still mode',async()=>{
  const {page,context,errors}=await fixture.openPage('index.html?world-debug',{width:1440,reducedMotion:'no-preference'});
  try{
    await ready(page);await page.evaluate(()=>window.__originalCanvas=document.querySelector('.world-canvas'));
    await go(page,'form');const forward=await page.evaluate(()=>window.__alkWorld.stats());
    assert.ok(await page.locator('.world-sticky').evaluate(e=>Math.abs(e.getBoundingClientRect().top)<1),'Canvas stays in viewport');
    await page.locator('#worldLight').focus();await page.keyboard.press('Space');
    assert.equal(await page.locator('#worldLight').getAttribute('aria-pressed'),'true');
    await page.mouse.move(540,420);
    await page.waitForFunction(()=>document.querySelector('#worldViewport').dataset.hover==='inspect');
    const raking=await page.evaluate(()=>window.__alkWorld.capture());
    await page.mouse.click(540,420);
    assert.equal(await page.locator('#worldLight').getAttribute('aria-pressed'),'false','Sculpture and keyboard control share one action');
    assert.notEqual(await page.evaluate(()=>window.__alkWorld.capture()),raking,'The light changes the rendered surface');
    await page.mouse.move(100,40);
    await page.click('#searchToggle');
    await page.waitForFunction(()=>window.__alkWorld.stats().active===false);
    await page.keyboard.press('Escape');await page.waitForFunction(()=>window.__alkWorld.stats().active===true);
    await go(page,'expression');assert.equal(await page.locator('#worldLight').getAttribute('aria-pressed'),'false');
    await go(page,'collection');await go(page,'form');const reverse=await page.evaluate(()=>window.__alkWorld.stats());
    forward.camera.forEach((v,i)=>assert.ok(Math.abs(v-reverse.camera[i])<.002));
    assert.equal(await page.evaluate(()=>document.querySelector('.world-canvas')===window.__originalCanvas),true);
    await page.setViewportSize({width:390,height:844});await go(page,'heritage');
    assert.equal(await page.locator('.world-canvas').count(),1);
    await page.locator('.world-chapter-nav a[href="#expression"]').click();
    await page.waitForURL('**#expression');await go(page,'expression');
    await page.reload();await ready(page);
    await page.waitForFunction(()=>Math.abs(window.__alkWorld.stats().exact-2)<.001);
    assert.ok(Math.abs((await page.evaluate(()=>window.__alkWorld.stats())).exact-2)<.001);
    await go(page,'heritage');
    await page.waitForFunction(()=>window.__alkWorld.stats().settled);
    const count=await page.evaluate(()=>window.__alkWorld.stats().frames);await page.waitForTimeout(250);
    assert.equal(await page.evaluate(()=>window.__alkWorld.stats().frames),count,'No idle render loop');
    await page.click('#worldMotion');assert.equal(await page.locator('.world-canvas').count(),0);
    assert.equal(await page.locator('html').evaluate(e=>e.classList.contains('lenis')),false);
    await page.click('#worldMotion');await ready(page);await page.emulateMedia({reducedMotion:'reduce'});
    assert.equal(await page.locator('.world-canvas').count(),0);
    assert.deepEqual(errors,[]);
  }finally{await context.close();}
});
test('context loss and a missing model retain content, search and store entry',async()=>{
  const {page,context,errors}=await fixture.openPage('index.html?world-debug',{width:1440,reducedMotion:'no-preference'});
  try{
    await ready(page);
    await page.locator('canvas.world-canvas').evaluate(canvas=>canvas.getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());
    await page.waitForFunction(()=>document.querySelector('#scrollWorld').dataset.worldState==='poster');
    assert.equal(await page.locator('.world-canvas').count(),0);
    await context.route('**/terracotta-study.glb*',route=>route.fulfill({status:503,body:''}));await page.reload();
    await page.waitForFunction(()=>window.__alkWorld?.stats().failed,null,{timeout:60000});
    assert.equal(await page.locator('.world-poster img').evaluate(e=>e.naturalWidth>0),true);
    await page.click('#searchToggle');await page.waitForSelector('#headerSearchModal',{state:'visible'});await page.keyboard.press('Escape');
    assert.equal(await page.locator('.world-primary').getAttribute('href'),'shop.html');
    assert.deepEqual(errors,[]);
  }finally{await context.close();}
});
test('without JavaScript the complete story and store links remain visible',async()=>{
  const {page,context}=await fixture.openPage('index.html',{width:390,height:844,javaScriptEnabled:false});
  try{
    assert.equal(await page.locator('.world-chapter').count(),4);
    assert.equal(await page.locator('.world-primary').isVisible(),true);
    assert.equal(await page.locator('.world-noscript-nav').isVisible(),true);
    await page.locator('#expression').scrollIntoViewIfNeeded();assert.equal(await page.locator('#worldArtworkImage').isVisible(),true);
    await page.locator('footer').scrollIntoViewIfNeeded();assert.equal(await page.locator('footer').isVisible(),true);
  }finally{await context.close();}
});
