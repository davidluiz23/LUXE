const assert=require('node:assert/strict');
const {AxeBuilder}=require('@axe-core/playwright');
const {startFixture}=require('../tests/browser/fixture.cjs');
(async()=>{
 const fixture=await startFixture();let failures=0;
 try{
  const routes=process.argv.slice(2).length?process.argv.slice(2):['cart.html'];
  for(const route of routes)for(const width of [1440,390]){
   let context;
   try{
    const opened=await fixture.openPage(route+(route==='product.html'?'?id=1001':''),{width});
    context=opened.context;const {page,errors}=opened;
    await page.evaluate(()=>document.fonts.ready);
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
    const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
    const violations=result.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,detail:n.failureSummary}))}));
    console.log(JSON.stringify({route,width,errors,overflow,violations}));
    if(overflow||errors.length||violations.length)failures++;
   }catch(error){failures++;console.log(JSON.stringify({route,width,error:error.message}));}
   finally{await context?.close();}
  }
 }finally{await fixture.close();}
 assert.equal(failures,0,`${failures} page audits failed`);
})().catch(error=>{console.error(error.message);process.exitCode=1;});
