const fs=require('node:fs');
const path=require('node:path');
const {startFixture}=require('../tests/browser/fixture.cjs');
(async()=>{
 const out=path.resolve(__dirname,'../artifacts/poster');fs.mkdirSync(out,{recursive:true});
 const fixture=await startFixture();
 try{
  for(const width of [1440,390]){
   for(const route of ['index.html','about.html','shop.html','product.html?id=1001']){
    const {page,context,errors}=await fixture.openPage(route,{width,height:900,reducedMotion:'reduce'});
    try{
     await page.evaluate(()=>document.fonts.ready);
     const name=route.split('.')[0];
     await page.screenshot({path:path.join(out,name+'-'+width+'.png')});
     if(name==='index'){
      await page.screenshot({path:path.join(out,'home-full-'+width+'.png'),fullPage:true});
      for(const selector of ['.poster-collection','.poster-world','.poster-edit']){
       await page.locator(selector).scrollIntoViewIfNeeded();
       await page.screenshot({path:path.join(out,selector.slice(1)+'-'+width+'.png')});
      }
     }
     console.log(JSON.stringify({route,width,errors,...await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,unloaded:[...document.images].filter(i=>i.getBoundingClientRect().top<innerHeight&&i.getBoundingClientRect().bottom>0&&!i.naturalWidth).map(i=>i.src)}))}));
    }finally{await context.close();}
   }
  }
 }finally{await fixture.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
