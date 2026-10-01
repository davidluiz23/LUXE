// Capture the actual shader as its static/reduced-motion poster. This renders
// the application; it does not draw or alter the generated relief-print art.
const fs=require('node:fs');
const path=require('node:path');
const {startFixture}=require('../tests/browser/fixture.cjs');
(async()=>{
  const fixture=await startFixture();
  const original=path.resolve(__dirname,'../source-assets/culture');
  const output=path.resolve(__dirname,'../Frontend/assets/culture');
  fs.mkdirSync(original,{recursive:true});
  try{
    for(const [width,height,suffix] of [[1536,1024,''],[768,1536,'-mobile']]){
      const {page,context,errors}=await fixture.openPage('index.html',{width,height,reducedMotion:'no-preference'});
      try{
        await page.waitForFunction(()=>document.querySelector('[data-liquid-art]').dataset.artState==='moving');
        await page.addStyleTag({content:'html,body{overflow:hidden!important}body>:not(.culture-page-art){visibility:hidden!important}'});
        await page.waitForTimeout(350);
        await page.locator('.culture-motion').evaluate(button=>button.click());
        const png=await page.locator('.culture-page-art').screenshot({path:path.join(original,'contour-flow'+suffix+'.png')});
        const webp=await page.evaluate(async source=>{
          const image=new Image();image.src=source;await image.decode();
          const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
          canvas.getContext('2d').drawImage(image,0,0);
          return canvas.toDataURL('image/webp',.87).split(',')[1];
        },'data:image/png;base64,'+png.toString('base64'));
        fs.writeFileSync(path.join(output,'contour-flow'+suffix+'.webp'),Buffer.from(webp,'base64'));
        console.log(JSON.stringify({width,height,errors,file:'contour-flow'+suffix+'.webp'}));
      }finally{await context.close();}
    }
  }finally{await fixture.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
