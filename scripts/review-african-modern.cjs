const fs=require('node:fs');
const path=require('node:path');
const {startFixture}=require('../tests/browser/fixture.cjs');
(async()=>{
 const fixture=await startFixture(),out=path.resolve(__dirname,'../artifacts/african-modern');fs.mkdirSync(out,{recursive:true});
 try {
   const {page,context,errors}=await fixture.openPage('index.html',{width:1440,height:1024});
   await page.locator('#campaignStage .campaign-controls').waitFor({state:'visible'});
   await page.evaluate(()=>document.fonts.ready);
   await page.screenshot({path:path.join(out,'home-desktop.png')});
   await page.screenshot({path:path.join(out,'home-desktop-full.jpg'),fullPage:true,type:'jpeg',quality:82});
   console.log('desktop',await page.evaluate(()=>({w:innerWidth,scroll:document.documentElement.scrollWidth,font:getComputedStyle(document.querySelector('h1')).font,hero:document.querySelector('.modern-hero').getBoundingClientRect().toJSON()})),errors);
   await page.setViewportSize({width:390,height:900});
   await page.screenshot({path:path.join(out,'home-mobile.png')});
   await page.screenshot({path:path.join(out,'home-mobile-full.jpg'),fullPage:true,type:'jpeg',quality:78});
   console.log('mobile',await page.evaluate(()=>({w:innerWidth,scroll:document.documentElement.scrollWidth})),errors);
   await page.locator('[data-pose-next]').click();
   await page.waitForFunction(()=>document.querySelector('#campaignStage').dataset.pose==='1');
   console.log('pose2',await page.locator('#campaignStatus').textContent());
   await page.setViewportSize({width:320,height:800});
   await page.screenshot({path:path.join(out,'home-320.png')});
   console.log('320',await page.evaluate(()=>({w:innerWidth,scroll:document.documentElement.scrollWidth})),errors);
   await context.close();
 }finally{await fixture.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
