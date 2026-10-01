const fs = require('node:fs');
const path = require('node:path');
const {startFixture} = require('../tests/browser/fixture.cjs');
(async () => {
  const fixture = await startFixture();
  try {
    for (const [name, width, height] of [['desktop',1440,900],['tablet',768,1024],['mobile',390,844]]) {
      const {page, context} = await fixture.openPage('index.html?world-debug', {width, reducedMotion:'no-preference'});
      await page.setViewportSize({width, height});
      await page.waitForFunction(() => document.querySelector('#scrollWorld').dataset.worldState === 'ready', null, {timeout:60000});
      await page.evaluate(() => scrollTo({top:0,behavior:'instant'}));
      await page.waitForTimeout(300);
      const data = await page.evaluate(() => window.__alkWorld.capture());
      const file = path.resolve(__dirname, '../Frontend/assets/heritage/gallery-' + name + '.webp');
      fs.writeFileSync(file, Buffer.from(data.split(',')[1], 'base64'));
      console.log(name, fs.statSync(file).size, 'bytes');
      await context.close();
    }
  } finally {await fixture.close();}
})().catch(error => {console.error(error);process.exit(1);});
