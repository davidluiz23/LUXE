// Render the Blender-authored GLB with the storefront's actual material/light setup.
// This keeps the static, low-power and reduced-motion views faithful to the live scene.
const fs=require('node:fs');const path=require('node:path');
const {startFixture}=require('../tests/browser/fixture.cjs');
(async()=>{
  const fixture=await startFixture();
  try {
    const {page,context}=await fixture.openPage('about.html',{width:800});
    await page.setViewportSize({width:800,height:960});
    const output=await page.evaluate(async()=>{
      document.head.querySelectorAll('link[rel="stylesheet"]').forEach(link=>link.remove());
      document.body.className='';document.body.style.cssText='margin:0;padding:0;background:transparent;';
      const viewport=document.createElement('div');viewport.style.cssText='width:800px;height:960px;position:relative;';
      document.body.replaceChildren(viewport);
      const {createHeritageScene}=await import('/js/heritage/renderer.js');
      const scene=await createHeritageScene(viewport,{modelURL:new URL('/assets/heritage/terracotta-study.glb',location.href),onFailure(){throw new Error('Poster rendering failed');}});
      const png=scene.capture('image/png'),webp=scene.capture('image/webp',.9);
      scene.dispose();return {png,webp};
    });
    const web=path.resolve(__dirname,'../Frontend/assets/heritage');
    for(const type of ['png','webp'])fs.writeFileSync(path.join(web,'terracotta-study.'+type),Buffer.from(output[type].split(',')[1],'base64'));
    const statsPath=path.resolve(__dirname,'../source-assets/heritage/production-stats.json');
    const stats=JSON.parse(fs.readFileSync(statsPath,'utf8'));
    stats.poster='800x960 RGBA PNG/WebP, rendered from the Blender-authored GLB using storefront Three.js lighting';
    stats.posterWebpBytes=fs.statSync(path.join(web,'terracotta-study.webp')).size;
    stats.glbBytes=fs.statSync(path.join(web,'terracotta-study.glb')).size;
    fs.writeFileSync(statsPath,JSON.stringify(stats,null,2)+'\n');
    console.log(JSON.stringify({poster:stats.poster,bytes:stats.posterWebpBytes}));
    await context.close();
  } finally {await fixture.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
