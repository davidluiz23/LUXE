const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {startFixture}=require('./fixture.cjs');
let fixture;
before(async()=>{fixture=await startFixture();});
after(async()=>{await fixture?.close();});

test('the selected hero recomposes across desktop, tablet and phone without text covering the garment',async()=>{
  const {page,context,errors}=await fixture.openPage('index.html',{width:1440,height:900,reducedMotion:'reduce'});
  try{
    await page.evaluate(()=>document.fonts.ready);
    for(const width of [1440,1200,1000,851,850,768,601,600,390,320,2560]){
      await page.setViewportSize({width,height:900});
      const details=await page.evaluate(()=>{
        const arch=document.querySelector('.canvas-arch').getBoundingClientRect();
        const overlap=[...document.querySelectorAll('.canvas-title > *')].some(element=>{
          const range=document.createRange();range.selectNodeContents(element);
          return [...range.getClientRects()].some(r=>r.width>0&&r.left<arch.right&&r.right>arch.left&&r.top<arch.bottom&&r.bottom>arch.top);
        });
        return {overlap,overflow:document.documentElement.scrollWidth>innerWidth,pins:document.querySelectorAll('.pin-spacer').length};
      });
      assert.equal(details.overflow,false,`${width}px has no horizontal overflow`);
      assert.equal(details.overlap,false,`${width}px heading stays outside the garment stage`);
      assert.equal(details.pins,0);
    }
    assert.deepEqual(errors,[]);
  }finally{await context.close();}
});

test('short landscape keeps the story link visible below the header when focused',async()=>{
  for(const width of [667,844]){
    const {page,context,errors}=await fixture.openPage('index.html',{width,height:390,reducedMotion:'no-preference'});
    try{
      await page.waitForFunction(()=>document.documentElement.classList.contains('lenis'));
      const link=page.locator('.canvas-story .canvas-text-link');await link.focus();
      const bounds=await link.evaluate(element=>{
        const r=element.getBoundingClientRect(),header=document.querySelector('#navbar').getBoundingClientRect();
        return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,headerBottom:header.bottom,height:innerHeight,width:innerWidth};
      });
      assert.ok(bounds.top>=bounds.headerBottom&&bounds.bottom<=bounds.height,JSON.stringify(bounds));
      assert.ok(bounds.left>=0&&bounds.right<=bounds.width);
      assert.equal(await page.locator('.pin-spacer').count(),0);
      assert.deepEqual(errors,[]);
    }finally{await context.close();}
  }
});

test('category links remain keyboard reachable while scroll motion is active',async()=>{
  const {page,context,errors}=await fixture.openPage('index.html',{width:1440,height:900,reducedMotion:'no-preference'});
  try{
    await page.waitForFunction(()=>document.documentElement.classList.contains('lenis'));
    for(const route of ['men.html','women.html','shop.html']){
      const selector=`.canvas-category-links a[href="${route}"]`;
      await page.locator(selector).focus();
      await page.waitForFunction(selector=>{
        const link=document.querySelector(selector),r=link.getBoundingClientRect();
        const header=document.querySelector('#navbar').getBoundingClientRect();
        return document.activeElement===link&&r.top>=header.bottom&&r.bottom<=innerHeight;
      },selector);
    }
    assert.deepEqual(errors,[]);
  }finally{await context.close();}
});
