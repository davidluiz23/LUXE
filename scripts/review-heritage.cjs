const fs = require('node:fs');
const path = require('node:path');
const {startFixture} = require('../tests/browser/fixture.cjs');
(async () => {
  const output = path.join(__dirname,'../artifacts/heritage');
  fs.mkdirSync(output,{recursive:true});
  const fixture=await startFixture();
  const report=[];
  try {
    for (const width of [360,390,768,1120,1440]) {
      const {page,context,errors}=await fixture.openPage('index.html',{width});
      await page.locator('img').evaluateAll(images => images.forEach(image => { image.loading='eager'; }));
      await page.evaluate(() => Promise.allSettled([...document.images].map(image=>image.decode())));
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({path:path.join(output,`home-${width}.png`),fullPage:true});
      await page.locator('#productStage').screenshot({path:path.join(output,`opening-${width}.png`)});
      await page.locator('#heritage').scrollIntoViewIfNeeded();
      await page.locator('#heritage').screenshot({path:path.join(output,`heritage-${width}.png`)});
      const session=await context.newCDPSession(page);
      await session.send('DOM.enable'); await session.send('CSS.enable');
      const {root}=await session.send('DOM.getDocument');
      const fonts={};
      for (const selector of ['#openingTitle','.heritage-description','#heritageTitle em','#collectionGrid a:last-child h3']) {
        const {nodeId}=await session.send('DOM.querySelector',{nodeId:root.nodeId,selector});
        fonts[selector]=(await session.send('CSS.getPlatformFontsForNode',{nodeId})).fonts;
      }
      report.push({width,fonts,errors,overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)});
      await context.close();
    }
    for(const name of ['about.html','shop.html','login.html','cart.html']) {
      const {page,context,errors}=await fixture.openPage(name,{width:390});
      await page.screenshot({path:path.join(output,name.replace('.html','-390.png')),fullPage:true});
      report.push({page:name,errors,overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)});
      await context.close();
    }
    const {page,context,errors}=await fixture.openPage('index.html',{width:1440,reducedMotion:'no-preference'});
    await page.locator('#heritage').scrollIntoViewIfNeeded();
    await page.waitForFunction(()=>document.querySelector('[data-heritage-scene]').dataset.state==='ready',null,{timeout:60000});
    await page.waitForTimeout(900);
    await page.locator('#heritage').screenshot({path:path.join(output,'heritage-live-desktop.png')});
    await page.waitForTimeout(1800);
    await page.locator('#heritage').screenshot({path:path.join(output,'heritage-live-turn.png')});
    await page.setViewportSize({width:390,height:844});
    await page.locator('.heritage-art').scrollIntoViewIfNeeded();
    await page.locator('#heritage').screenshot({path:path.join(output,'heritage-live-mobile.png')});
    report.push({live:true,errors});
    await context.close();
  } finally {
    fs.writeFileSync(path.join(output,'review.json'),JSON.stringify(report,null,2));
    await fixture.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
