const fs = require('node:fs');
const path = require('node:path');
const {startFixture} = require('../tests/browser/fixture.cjs');
const out = path.resolve(__dirname, '../artifacts/scroll-world');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  fs.mkdirSync(out, {recursive: true});
  const fixture = await startFixture();
  const results = [];
  const validation = {date: new Date().toISOString(), environment: 'Headless local Chrome, DPR 1; local service fixtures; no physical phone GPU measurement', viewports: [], fallbacks: []};
  try {
    for (const [width, height] of [[1440,900],[768,1024],[390,844]]) {
      const {page, context, errors} = await fixture.openPage('index.html?world-debug', {width, reducedMotion: 'no-preference'});
      await page.setViewportSize({width,height});
      const messages = []; page.on('console', message => {if(message.type() === 'error') messages.push(message.text());});
      await page.waitForFunction(() => document.querySelector('[data-world-state="ready"]') || window.__alkWorld?.stats().failed, null, {timeout: 40000});
      const measures = await page.evaluate(async () => {
        const tasks = [];
        const observer = new PerformanceObserver(list => tasks.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration}))));
        observer.observe({type:'longtask',buffered:true});
        await new Promise(resolve=>setTimeout(resolve,100));observer.disconnect();
        return {longTasks: tasks, resources: performance.getEntriesByType('resource').filter(r=>r.name.startsWith(location.origin)).map(r=>({name:new URL(r.name).pathname,bytes:r.encodedBodySize,duration:r.duration})), paint:performance.getEntriesByType('paint').map(e=>({name:e.name,start:e.startTime}))};
      });
      for (const chapter of ['heritage','form','expression','collection']) {
        await page.evaluate(id => window.scrollTo({top: document.getElementById(id).getBoundingClientRect().top + scrollY, behavior: 'instant'}), chapter);
        await delay(1600);
        const filename = `${width}-${chapter}.png`;
        await page.screenshot({path: path.join(out, filename)});
        const stats = await page.evaluate(() => ({...window.__alkWorld?.stats(), overflow: document.documentElement.scrollWidth > innerWidth, scrollY, height: innerHeight}));
        results.push({width, height, chapter, filename, ...stats});
      }
      validation.viewports.push({width,height,...measures,errors,consoleErrors:messages});
      console.log('Captured four chapters at', width, 'with', errors.length, 'page errors.');
      await context.close();
    }
    for (const mode of ['reduced-motion', 'no-javascript']) {
      const {page,context,errors}=await fixture.openPage('index.html',{width:390,height:844,javaScriptEnabled:mode!=='no-javascript'});
      await page.screenshot({path:path.join(out,`${mode}-390.png`)});
      await page.locator('#expression').scrollIntoViewIfNeeded();
      await page.screenshot({path:path.join(out,`${mode}-expression-390.png`)});
      validation.fallbacks.push({mode,errors,canvases:await page.locator('.world-canvas').count(),artworkVisible:await page.locator('#worldArtworkImage').isVisible()});
      await context.close();
    }
    fs.writeFileSync(path.join(out,'compositions.json'), JSON.stringify(results,null,2));
    validation.maxDrawCalls=Math.max(...results.map(r=>r.calls||0));
    validation.maxTriangles=Math.max(...results.map(r=>r.triangles||0));
    validation.maxTextures=Math.max(...results.map(r=>r.textures||0));
    validation.maxPrograms=Math.max(...results.map(r=>r.programs||0));
    validation.maxLocalResourceBytes=Math.max(...validation.viewports.map(v=>v.resources.reduce((sum,r)=>sum+r.bytes,0)));
    fs.writeFileSync(path.join(out,'validation.json'),JSON.stringify(validation,null,2));
  } finally {await fixture.close();}
})().catch(error => {console.error(error);process.exit(1);});
