// Assemble the active presentation without touching commerce or customer data.
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');
const root = path.resolve(__dirname, '..');
const frontend = path.join(root,'Frontend');
const homeOnly = process.argv.includes('--home-only');
const bundleName = homeOnly ? 'living-canvas' : 'culture';
const source = name => fs.readFileSync(path.join(__dirname,'culture',name),'utf8').trim();
const header = fs.readFileSync(path.join(__dirname,'world/header.html'),'utf8').trim()
  .replace(/@@([a-z0-9-]+)@@/g,(_,name)=>fs.readFileSync(path.join(frontend,'assets/icons',name+'.svg'),'utf8').replace('<svg ','<svg class="nav-svg-icon" aria-hidden="true" focusable="false" '))
  .replace('>Shop</a>','>Collection</a>').replace('world-noscript-nav','culture-noscript-nav');
const footer = source('footer.html');
const background = source('background.html');
for (const name of fs.readdirSync(frontend).filter(name=>name.endsWith('.html') && name!=='admin.html' && (!homeOnly || name==='index.html'))) {
  const file = path.join(frontend,name);
  let html = fs.readFileSync(file,'utf8');
  html = html.replace(/<body([^>]*)>/,(_,attrs)=>{
    let clean = attrs.replace(/\sclass="[^"]*"/,'').replace(/\sid="[^"]*"/,'');
    return '<body'+clean+' id="top" class="culture-site page-'+name.replace('.html','')+(name==='index.html'?' living-canvas-site':'')+'">';
  });
  html = html.replace(/\s*<!-- culture-background:start -->[\s\S]*?<!-- culture-background:end -->/g,'');
  html = html.replace(/<body[^>]*>/,match=>match+'\n'+(name==='index.html'?background.replace('data-liquid-art ','data-liquid-art data-liquid-fit="fill" '):background));
  if (/<header\b/.test(html)) html = html.replace(/<header\b[\s\S]*?<\/header>(?:\s*<noscript>[\s\S]*?<\/noscript>)?/,header);
  if (name==='index.html' || name==='about.html') html = html.replace(/<main id="mainContent"[^>]*>[\s\S]*?<\/main>/,source(name==='index.html'?'home.html':'about.html'));
  if (/<footer\b/.test(html)) html = html.replace(/<footer\b[\s\S]*?<\/footer>/,footer);
  else html = html.replace('</body>',footer+'\n</body>');
  // Previous concepts remain on disk for reference but no longer compete in the cascade.
  html = html.replace(/<link\b[^>]*href=["'](?:css\/(?:home|world|art-direction|atelier|editorial-commerce|house-photography|streetwear|culture|living-canvas)|js\/(?:world|culture|living-canvas)\/experience)\.css[^"']*["'][^>]*>/g,'');
  html = html.replace(/<script\b[^>]*src=["']js\/(?:home-stage|heritage-scene|art-direction|atelier|culture-field|animation|(?:world|culture|living-canvas)\/experience)\.js[^"']*["'][^>]*>\s*<\/script>/g,'');
  html = html.replace(/<link\b[^>]*href="assets\/fonts\/barlow-condensed-600-latin\.woff2"[^>]*>/g,'');
  html = html.replace('</head>','<link rel="preload" href="assets/fonts/barlow-condensed-600-latin.woff2" as="font" type="font/woff2" crossorigin />\n    <link rel="stylesheet" href="css/culture.css?v=20260930-2" />\n    '+(name==='index.html'?'<link rel="stylesheet" href="css/living-canvas.css?v=20261001-1" />\n    ':'')+'<link rel="stylesheet" href="js/'+bundleName+'/experience.css?v=20261001-1" />\n    <script type="module" src="js/'+bundleName+'/experience.js?v=20261001-1"></script>\n  </head>');
  html = html.replace(/js\/luxury-ui\.js\?v=[^"']+/g,'js/luxury-ui.js?v=20260930-2');
  if (name==='index.html') html = html.replaceAll('ALKEBULAN | Wear the story.','ALKEBULAN | Culture in motion.');
  html = html.replace(/(?:\n[ \t]*){3,}/g,'\n\n');
  html = html.replace(/[\t ]+\r?$/gm,'');
  fs.writeFileSync(file,html);
}
const outdir = path.join(frontend,'js',bundleName);
const build = esbuild.buildSync({entryPoints:{experience:path.join(__dirname,'culture/experience.mjs')},outdir,bundle:true,splitting:true,minify:true,format:'esm',target:['es2020'],legalComments:'eof',chunkNames:'[name]-[hash]',metafile:true});
const active = new Set(Object.keys(build.metafile.outputs).map(f=>path.resolve(f)));
// Delete only obsolete generated chunks inside this build's exact output directory.
for (const name of fs.readdirSync(outdir)) {
  const target = path.resolve(outdir,name);
  if (/^(?:liquid|chunk)-[A-Z0-9]+\.js$/.test(name) && path.dirname(target)===outdir && !active.has(target)) fs.unlinkSync(target);
}
const licenseDir = path.join(outdir,'LICENSES'); fs.mkdirSync(licenseDir,{recursive:true});
for (const pkg of ['three','lenis','gsap']) {
  const candidates = ['LICENSE','LICENSE.txt','LICENSE.md'].map(name=>path.join(root,'node_modules',pkg,name));
  const found = candidates.find(file=>fs.existsSync(file));
  if (found) fs.copyFileSync(found,path.join(licenseDir,pkg+'.txt'));
}
console.log(homeOnly?'Living Canvas: selected homepage assembled; local motion and artwork bundles built.':'Public pages assembled with the selected Living Canvas homepage; local motion and artwork bundles built.');
