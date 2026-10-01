const fs=require('node:fs');
const path=require('node:path');
const {startFixture}=require('../tests/browser/fixture.cjs');
const dir=path.resolve(__dirname,'../artifacts/culture');
fs.mkdirSync(dir,{recursive:true});
(async()=>{
  const fixture=await startFixture();
  try {
    for(const width of [1440,390,768,320]){
      const {page,context,errors}=await fixture.openPage('index.html',{width,height:900,reducedMotion:'no-preference'});
      const consoleErrors=[];page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});
      await page.evaluate(()=>document.fonts.ready);
      await page.waitForTimeout(2000);
      await page.screenshot({path:path.join(dir,'home-'+width+'.png')});
      console.log(JSON.stringify({width,errors,consoleErrors,details:await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,art:document.querySelector('[data-liquid-art]').dataset.artState,canvas:!!document.querySelector('.liquid-canvas canvas'),lenis:document.documentElement.classList.contains('lenis'),hero:document.querySelector('.culture-hero').getBoundingClientRect().toJSON(),heading:document.querySelector('h1').getBoundingClientRect().toJSON()}))}));
      await context.close();
    }
  } finally {await fixture.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
