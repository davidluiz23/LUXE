// Local visual review with isolated commerce fixtures; never sends live orders or auth requests.
const fs = require('node:fs');
const path = require('node:path');
const {startFixture} = require('../tests/browser/fixture.cjs');
const pieces = ['Ijele','Durbar','Dùn Dùn'];
const photos = ['ijele','durbar','dun-dun'];
const products = Array.from({length:9},(_,i)=>({id:1001+i,name:pieces[i%3],category:i%2?'Women':'Men',subcategory:'Graphic tees',brand:'ALKEBULAN',price:60+i*10,price_ngn:90000+i*15000,image:`assets/products/${photos[i%3]}.jpg`,hover_image:`assets/products/${photos[(i+1)%3]}.jpg`,sizes:['M','L','XL'],colors:['Black','White'],tags:[],in_stock:true,stock_quantity:5,created_at:'2026-09-01T00:00:00Z',description:'Artwork in print. A graphic piece from ALKEBULAN.'}));
(async()=>{
  const dir=path.resolve(__dirname,'../artifacts/redesign'); fs.mkdirSync(dir,{recursive:true});
  const fixture=await startFixture(); const report=[];
  try {
    const routes=process.argv.slice(2).length?process.argv.slice(2):['index.html','shop.html','product.html?id=1001','men.html','women.html','login.html','cart.html','checkout.html','about.html','contact.html','faq.html','wishlist.html','dashboard.html','videos.html'];
    for(const route of routes) for(const width of [1440,390]) {
      const {page,context,errors}=await fixture.openPage(route,{width,state:{__fixture:products},saved:{luxe_cart:[{id:1001,quantity:1,size:'M',color:'Black'}]}});
      await page.evaluate(()=>document.fonts.ready);
      await page.locator('img').evaluateAll(images=>images.forEach(image=>image.loading='eager'));
      await page.evaluate(()=>Promise.allSettled([...document.images].map(image=>image.decode())));
      if(route.includes('product.html')) await page.locator('#productAddToCart').waitFor();
      const name=route.split('.')[0]+'-'+width;
      await page.screenshot({path:path.join(dir,name+'.png'),fullPage:true,timeout:60000});
      const details=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,brokenImages:[...document.images].filter(x=>!x.naturalWidth).map(x=>x.getAttribute('src')),grid:document.querySelector('.product-grid')?getComputedStyle(document.querySelector('.product-grid')).gridTemplateColumns:null}));
      report.push({route,width,errors,...details});console.log(JSON.stringify(report.at(-1)));
      if(route==='index.html' && width===390) {await page.locator('#hamburger').click();await page.screenshot({path:path.join(dir,'menu-390.png')});}
      await context.close();
    }
  } finally {fs.writeFileSync(path.join(dir,'review.json'),JSON.stringify(report,null,2));await fixture.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
