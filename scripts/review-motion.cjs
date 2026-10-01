const fs=require('node:fs');
const path=require('node:path');
const {startFixture}=require('../tests/browser/fixture.cjs');
(async()=>{
  const directory=path.resolve(__dirname,'../artifacts/culture');fs.mkdirSync(directory,{recursive:true});
  const fixture=await startFixture();
  try{
    for(const width of [1440,390]){
      const {page,context,errors}=await fixture.openPage('index.html',{width,height:900,reducedMotion:'no-preference'});
      try{
        await page.evaluate(()=>document.fonts.ready);
        await page.waitForFunction(()=>document.querySelector('[data-liquid-art]').dataset.artState==='moving');
        await page.waitForTimeout(1000);
        await page.screenshot({path:path.join(directory,`motion-hero-${width}.png`)});
        const origin=await page.locator('.culture-origin-stage').evaluate(element=>element.getBoundingClientRect().top+scrollY-(innerWidth<760?92:108));
        for(const [name,offset] of [['arrival',40],['unravel',width<760?650:900]]){
          await page.evaluate(y=>window.scrollTo({top:y,behavior:'instant'}),origin+offset);
          await page.waitForTimeout(1300);
          await page.screenshot({path:path.join(directory,`motion-${name}-${width}.png`)});
        }
        const archive=await page.locator('.culture-archive').evaluate(element=>element.getBoundingClientRect().top+scrollY-108);
        await page.evaluate(y=>window.scrollTo({top:y,behavior:'instant'}),archive+350);
        await page.waitForTimeout(1300);
        await page.screenshot({path:path.join(directory,`motion-archive-${width}.png`)});
        console.log(JSON.stringify({width,errors,...await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,canvases:document.querySelectorAll('.liquid-canvas canvas').length,art:document.querySelector('[data-liquid-art]').dataset.artState,originPinned:!!document.querySelector('.culture-origin .pin-spacer'),horizontal:document.querySelector('.culture-archive').classList.contains('is-horizontal'),headerHeight:document.getElementById('navbar').getBoundingClientRect().height}))}));
      }finally{await context.close();}
    }
  }finally{await fixture.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
