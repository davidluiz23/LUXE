const fs=require('node:fs');
const path=require('node:path');
const {startFixture}=require('../tests/browser/fixture.cjs');
const AxeBuilder=require('@axe-core/playwright').default;

(async()=>{
  const dir=path.resolve(__dirname,'../artifacts/living-canvas');fs.mkdirSync(dir,{recursive:true});
  const fixture=await startFixture();const report=[];
  try{
    for(const width of [1440,390,768,320]){
      const {page,context,errors}=await fixture.openPage('index.html',{width,height:1000,reducedMotion:'reduce'});
      try{
        await page.evaluate(()=>document.fonts.ready);
        await page.locator('img').evaluateAll(images=>images.forEach(img=>img.loading='eager'));
        await page.evaluate(()=>Promise.allSettled([...document.images].map(img=>img.decode())));
        await page.screenshot({path:path.join(dir,`home-${width}.png`),fullPage:true});
        await page.screenshot({path:path.join(dir,`hero-${width}.png`)});
        const details=await page.evaluate(()=>({
          overflow:document.documentElement.scrollWidth>innerWidth,
          brokenImages:[...document.images].filter(img=>!img.naturalWidth).map(img=>img.getAttribute('src')),
          h1:document.querySelector('h1').textContent,
          headingFont:getComputedStyle(document.querySelector('h1')).fontFamily,
          mainFont:getComputedStyle(document.body).fontFamily,
          bounds:Object.fromEntries(['.canvas-title-left','.canvas-title-right','.canvas-arch','.canvas-hero-copy','#navbar'].map(selector=>{const r=document.querySelector(selector).getBoundingClientRect();return[selector,{x:r.x,y:r.y,width:r.width,height:r.height}];}))
        }));
        const accessibility=[1440,390].includes(width)?(await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations.map(({id,description,nodes})=>({id,description,nodes:nodes.map(n=>({target:n.target,summary:n.failureSummary}))})):[];
        report.push({width,errors,...details,accessibility});console.log(JSON.stringify(report.at(-1)));
      }finally{await context.close();}
    }
    const {page,context,errors}=await fixture.openPage('index.html',{width:1440,height:1000,reducedMotion:'no-preference'});
    try{
      await page.waitForFunction(()=>document.querySelector('[data-liquid-art]').dataset.artState==='moving');
      await page.locator('.culture-motion').click();
      await page.evaluate(()=>document.fonts.ready);
      await page.waitForTimeout(1200);
      await page.screenshot({path:path.join(dir,'hero-motion-1440.png')});
      report.push({motion:true,errors,canvasCount:await page.locator('.liquid-canvas canvas').count()});
    }finally{await context.close();}
  }finally{fs.writeFileSync(path.join(dir,'review.json'),JSON.stringify(report,null,2));await fixture.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
