const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {startFixture}=require('./fixture.cjs');
let fixture;
before(async()=>{fixture=await startFixture();});
after(async()=>{await fixture?.close();});

test('the selected Living Canvas layout uses the original orange artwork and garment photographs',async()=>{
  const {page,context,errors}=await fixture.openPage('index.html',{width:1440});
  try{
    assert.equal(await page.locator('#mainContent.living-canvas').count(),1);
    assert.match(await page.locator('#cultureShirt').getAttribute('src'),/assets\/products\/ijele\.jpg$/);
    assert.equal(await page.locator('#cultureShirt').evaluate(image=>image.complete&&image.naturalWidth>0),true);
    assert.equal(await page.locator('.canvas-piece-card').count(),3);
    assert.match(await page.locator('h1').textContent(),/CULTURE in\s*motion\./);
    assert.equal(await page.locator('[data-liquid-art]').getAttribute('data-liquid-texture'),'assets/references/orange-liquid.jpg');
    assert.equal(await page.locator('[data-liquid-art] img').getAttribute('src'),'assets/references/orange-liquid.jpg');
    assert.equal(await page.locator('[data-liquid-art]').getAttribute('data-liquid-fit'),'fill');
    assert.equal(await page.locator('#mainContent img[src^="assets/culture/"], [data-liquid-art] img[src^="assets/culture/"]').count(),0,'generated replacement artwork is absent');
    assert.deepEqual(errors,[]);
  }finally{await context.close();}
});

test('artwork selection commits the image, caption, and link together; failed images preserve the selection',async()=>{
  const {page,context,errors}=await fixture.openPage('index.html',{width:1440});
  try{
    // Block before navigation so a previously decoded lazy category image cannot
    // satisfy the selection from the browser's image cache.
    await page.route('**/assets/products/dun-dun.jpg',route=>route.abort());
    await page.reload({waitUntil:'load'});
    await page.locator('[data-piece="durbar"]').click();
    await page.waitForFunction(()=>document.getElementById('cultureStage').dataset.selected==='durbar');
    assert.equal(await page.locator('#culturePieceName').textContent(),'Durbar');
    assert.match(await page.locator('#cultureShirt').getAttribute('src'),/durbar\.jpg$/);
    assert.equal(await page.locator('[data-piece="durbar"]').getAttribute('aria-pressed'),'true');
    await page.locator('[data-piece="dun-dun"]').click();
    await page.waitForFunction(()=>document.getElementById('culturePieceStatus').textContent.includes('could not load'));
    assert.equal(await page.locator('#culturePieceName').textContent(),'Durbar');
    assert.equal(await page.locator('[data-piece="durbar"]').getAttribute('aria-pressed'),'true');
    assert.deepEqual(errors,[]);
  }finally{await context.close();}
});

test('homepage and story are complete without JavaScript, with working collection links and static art',async()=>{
  for(const route of ['index.html','about.html']){
    const {page,context}=await fixture.openPage(route,{javaScriptEnabled:false,width:390});
    try{
      assert.equal(await page.locator('h1').isVisible(),true);
      assert.equal(await page.locator('.culture-footer').isVisible(),true);
      assert.equal(await page.locator('[data-liquid-art] img').evaluate(img=>img.naturalWidth>0),true);
      assert.equal(await page.locator('.liquid-canvas canvas').count(),0);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      assert.ok(await page.locator('a[href="shop.html"]').count()>0);
    }finally{await context.close();}
  }
});

test('reduced motion leaves native scroll and the original artwork visible',async()=>{
  const {page,context,errors}=await fixture.openPage('index.html',{reducedMotion:'reduce'});
  try{
    await page.waitForTimeout(250);
    assert.equal(await page.locator('.liquid-canvas canvas').count(),0);
    assert.equal(await page.locator('[data-liquid-art]').getAttribute('data-art-state'),'still');
    assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('lenis')),false);
    assert.equal(await page.locator('.culture-motion').isHidden(),true);
    assert.deepEqual(errors,[]);
  }finally{await context.close();}
});

test('liquid artwork pauses, survives context loss, and cleans up after a reduced-motion change',async()=>{
  const {page,context,errors}=await fixture.openPage('index.html',{width:1440,reducedMotion:'no-preference'});
  try{
    await page.waitForFunction(()=>document.querySelector('[data-liquid-art]').dataset.artState==='moving');
    const canvas=await page.locator('.liquid-canvas canvas').elementHandle();
    await page.locator('#archive').scrollIntoViewIfNeeded();
    await page.mouse.move(25,450);
    assert.equal(await page.locator('.liquid-canvas canvas').count(),1);
    assert.equal(await canvas.evaluate(element=>element.isConnected),true,'scrolling preserves the same canvas');
    assert.equal(await page.locator('[data-liquid-art]').evaluate(element=>{
      const box=element.getBoundingClientRect();return getComputedStyle(element).position==='fixed'&&box.top===0&&box.height===innerHeight;
    }),true,'art stays behind the whole viewport beyond the hero');
    const pause=page.locator('.culture-motion');
    await pause.click();
    assert.equal(await pause.getAttribute('aria-pressed'),'true');
    assert.equal(await page.locator('[data-liquid-art]').getAttribute('data-art-paused'),'true');
    const before=await page.locator('.liquid-canvas').screenshot();
    await page.waitForTimeout(150);
    const after=await page.locator('.liquid-canvas').screenshot();
    assert.equal(before.equals(after),true,'paused pigment stays still');
    await pause.click();
    assert.equal(await pause.getAttribute('aria-pressed'),'false');
    await page.locator('.liquid-canvas canvas').evaluate(canvas=>canvas.dispatchEvent(new Event('webglcontextlost',{cancelable:true})));
    assert.equal(await page.locator('.liquid-canvas canvas').count(),0);
    assert.equal(await page.locator('[data-liquid-art]').getAttribute('data-art-state'),'still');
    assert.equal(await page.locator('h1').isVisible(),true);
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.waitForFunction(()=>!document.documentElement.classList.contains('lenis')&&!document.querySelector('.pin-spacer'));
    assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('lenis')),false);
    assert.equal(await pause.isHidden(),true);
    assert.deepEqual(errors,[]);
  }finally{await context.close();}
});

test('the shared liquid background works on collection pages and leaves search usable',async()=>{
  const {page,context,errors}=await fixture.openPage('shop.html',{width:390,reducedMotion:'no-preference'});
  try{
    await page.waitForFunction(()=>document.querySelector('[data-liquid-art]').dataset.artState==='moving');
    await page.locator('.shop-section').scrollIntoViewIfNeeded();
    assert.equal(await page.locator('.liquid-canvas canvas').count(),1);
    await page.locator('#searchToggle').click();
    assert.equal(await page.locator('#headerSearchInput').isVisible(),true);
    await page.keyboard.press('Escape');
    await page.locator('.culture-motion').click();
    assert.equal(await page.locator('[data-liquid-art]').getAttribute('data-art-paused'),'true');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert.deepEqual(errors,[]);
  }finally{await context.close();}
});

test('hero depth remains separate from artwork selection and cleans up for reduced motion',async()=>{
  const {page,context,errors}=await fixture.openPage('index.html',{width:1440,height:900,reducedMotion:'no-preference'});
  try{
    await page.waitForFunction(()=>document.documentElement.classList.contains('lenis'));
    await page.evaluate(()=>document.fonts.ready);
    await page.evaluate(()=>window.scrollTo({top:300,behavior:'instant'}));
    await page.waitForFunction(()=>{
      const transform=getComputedStyle(document.querySelector('.canvas-shirt-depth')).transform;
      return transform!=='none' && new DOMMatrixReadOnly(transform).m42 < -2;
    });
    await page.locator('[data-piece="durbar"]').click();
    await page.waitForFunction(()=>document.getElementById('cultureStage').dataset.selected==='durbar');
    assert.match(await page.locator('#cultureShirt').getAttribute('src'),/durbar\.jpg$/);
    assert.equal(await page.locator('.pin-spacer').count(),0,'the selected composition stays in normal page flow');
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.waitForFunction(()=>!document.querySelector('.pin-spacer')&&!document.querySelector('.liquid-canvas canvas'));
    assert.equal(await page.locator('.pin-spacer').count(),0);
    assert.equal(await page.locator('.liquid-canvas canvas').count(),0);
    assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('lenis')),false);
    assert.equal(await page.locator('.canvas-shirt-depth').evaluate(element=>!element.style.transform),true);
    assert.equal(await page.locator('.canvas-piece-card').count(),3,'all artwork links remain available without motion');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert.deepEqual(errors,[]);
  }finally{await context.close();}
});

test('a motion preference change during deferred shader loading cannot mount a late canvas',async()=>{
  const {page,context,errors}=await fixture.openPage('index.html',{width:390,reducedMotion:'reduce'});
  try{
    let release;
    let entered;
    const requested=new Promise(resolve=>{entered=resolve;});
    await page.route('**/js/**/liquid-*.js',async route=>{entered();await new Promise(resolve=>{release=resolve;});await route.continue();});
    await page.emulateMedia({reducedMotion:'no-preference'});
    await requested;
    await page.emulateMedia({reducedMotion:'reduce'});
    release();
    await page.waitForTimeout(350);
    assert.equal(await page.locator('.liquid-canvas canvas').count(),0);
    assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('lenis')),false);
    assert.deepEqual(errors,[]);
  }finally{await context.close();}
});

test('navigation dialogs preserve keyboard focus and remain usable with the motion engine active',async()=>{
  const {page,context,errors}=await fixture.openPage('index.html',{width:390,reducedMotion:'no-preference'});
  try{
    await page.locator('#hamburger').click();
    assert.equal(await page.locator('#mobileMenu').isVisible(),true);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#mobileMenu').isHidden(),true);
    assert.equal(await page.locator('#hamburger').evaluate(element=>element===document.activeElement),true);
    await page.locator('#searchToggle').click();
    assert.equal(await page.locator('#headerSearchInput').isVisible(),true);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#searchToggle').evaluate(element=>element===document.activeElement),true);
    assert.deepEqual(errors,[]);
  }finally{await context.close();}
});

test('the homepage stays within phone, tablet, and ultrawide viewports',async()=>{
  for(const width of [320,390,768,1024,1920,2560]){
    const {page,context,errors}=await fixture.openPage('index.html',{width});
    try{
      await page.evaluate(()=>document.fonts.ready);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${width}px overflow`);
      assert.equal(await page.locator('h1').evaluate(element=>{const rect=element.getBoundingClientRect();return rect.left>=0&&rect.right<=innerWidth;}),true,`${width}px heading`);
      assert.deepEqual(errors,[]);
    }finally{await context.close();}
  }
});
