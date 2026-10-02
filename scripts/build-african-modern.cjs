// Rebuild the approved African Modern presentation while preserving commerce,
// account, admin and policy page content. Safe to run repeatedly.
const fs=require('node:fs');
const path=require('node:path');
const esbuild=require('esbuild');
const root=path.resolve(__dirname,'..'), frontend=path.join(root,'Frontend');
const source=name=>fs.readFileSync(path.join(__dirname,'african-modern',name),'utf8').trim();
const icons=html=>html.replace(/@@([a-z0-9-]+)@@/g,(_,name)=>{
  const icon=name==='arrow-left-linear'||name==='arrow-right-linear'?'arrow-right-up-linear':name;
  return fs.readFileSync(path.join(frontend,'assets/icons',icon+'.svg'),'utf8').replace('<svg ','<svg class="nav-svg-icon" aria-hidden="true" focusable="false" ');
});
const trace=JSON.parse(source('portrait-paths.json'));
// Use the existing artwork's silhouette as flat clay ink, with no baked-in
// glossy highlights. The same traced paths still animate its reveal.
const portrait='<svg viewBox="0 0 512 512" aria-hidden="true" focusable="false"><defs><filter id="portraitInk" color-interpolation-filters="sRGB"><feMorphology in="SourceAlpha" operator="erode" radius="1.1" result="inkShape"/><feFlood flood-color="#a65b45"/><feComposite in2="inkShape" operator="in"/></filter><mask id="portraitReveal" maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512"><g fill="none" stroke="white" stroke-width="17" stroke-linecap="round" stroke-linejoin="round">'+trace.paths.map(p=>'<path data-portrait-stroke d="'+p.d+'" />').join('')+'</g></mask></defs><image href="assets/african-modern/red-portrait.webp" width="512" height="512" filter="url(#portraitInk)" mask="url(#portraitReveal)" /></svg>';
const header=icons(source('header.html')),footer=source('footer.html');
const home=icons(source('home.html').replace('@@portrait@@',portrait));
const previewGrid=home.match(/<div class="modern-piece-grid">[\s\S]*?\n      <\/div>/)[0].replaceAll('href="shop.html"','href="contact.html"').replace(/ data-piece-link="[^"]*"/g,'').replace(/ data-reveal/g,'').replace(/ data-piece-price="[^"]*"/g,'');
const preview='<!-- intended-preview:start --><section class="intended-preview modern-shell" id="intendedPreview" aria-label="The original artwork collection" hidden><p>Meet Ijele, Durbar, and Dùn Dùn. These are our original graphic tees. <a href="contact.html">Contact us for current availability.</a></p>'+previewGrid+'</section><!-- intended-preview:end -->';
const homeOnly=process.argv.includes('--home-only');
for(const name of fs.readdirSync(frontend).filter(n=>n.endsWith('.html')&&n!=='admin.html'&&(!homeOnly||n==='index.html'))){
  const file=path.join(frontend,name);let html=fs.readFileSync(file,'utf8');
  html=html.replace(/<body([^>]*)>/,(_,attrs)=>'<body'+attrs.replace(/\sclass="[^"]*"/,'').replace(/\sid="[^"]*"/,'')+' id="top" class="african-modern-site page-'+name.replace('.html','')+'">');
  html=html.replace(/\s*<!-- culture-background:start -->[\s\S]*?<!-- culture-background:end -->/g,'');
  html=html.replace(/<header\b[\s\S]*?<\/header>(?:\s*<noscript>[\s\S]*?<\/noscript>)?/,header);
  if(name==='index.html')html=html.replace(/<main id="mainContent"[^>]*>[\s\S]*?<\/main>/,home);
  if(name==='about.html')html=html.replace(/<main id="mainContent"[^>]*>[\s\S]*?<\/main>/,source('about.html'));
  html=html.replace(/<!-- intended-preview:start -->[\s\S]*?<!-- intended-preview:end -->/g,'');
  if(['shop.html','men.html','women.html'].includes(name))html=html.replace('</main>',preview+'\n</main>');
  if(/<footer\b/.test(html))html=html.replace(/<footer\b[\s\S]*?<\/footer>/,footer);else html=html.replace('</body>',footer+'\n</body>');
  html=html.replace(/<link\b[^>]*href=["'](?:css\/(?:home|world|art-direction|atelier|editorial-commerce|house-photography|streetwear|culture|living-canvas|african-modern|african-modern-home)|js\/(?:world|culture|living-canvas|african-modern)\/experience)\.css[^"']*["'][^>]*>/g,'');
  html=html.replace(/<script\b[^>]*src=["']js\/(?:home-stage|heritage-scene|art-direction|atelier|culture-field|animation|(?:world|culture|living-canvas|african-modern)\/experience)\.js[^"']*["'][^>]*>\s*<\/script>/g,'');
  html=html.replace(/<link\b[^>]*href="assets\/fonts\/barlow-condensed-600-latin\.woff2"[^>]*>/g,'');
  html=html.replace('</head>','<link rel="stylesheet" href="js/african-modern/experience.css?v=20261002" />\n<link rel="stylesheet" href="css/african-modern.css?v=20261002" />\n<link rel="stylesheet" href="css/african-modern-home.css?v=20261002" />\n<script type="module" src="js/african-modern/experience.js?v=20261002"></script>\n</head>');
  html=html.replace(/js\/(luxury-ui|products|product)\.js\?v=[^"']+/g,'js/$1.js?v=20261002');
  if(name==='index.html')html=html.replace(/<title>[\s\S]*?<\/title>/,'<title>ALKEBULAN | African expression.</title>');
  html=html.replace(/(?:\n[ \t]*){3,}/g,'\n\n').replace(/[\t ]+\r?$/gm,'');
  fs.writeFileSync(file,html);
}
const outdir=path.join(frontend,'js/african-modern');
esbuild.buildSync({entryPoints:{experience:path.join(__dirname,'african-modern/experience.mjs')},outdir,bundle:true,minify:true,format:'esm',target:['es2020'],legalComments:'eof'});
const licenses=path.join(outdir,'LICENSES');fs.mkdirSync(licenses,{recursive:true});
for(const pkg of ['gsap','lenis']){const file=['LICENSE','LICENSE.txt','LICENSE.md'].map(n=>path.join(root,'node_modules',pkg,n)).find(f=>fs.existsSync(f));if(file)fs.copyFileSync(file,path.join(licenses,pkg+'.txt'));}
console.log('African Modern: '+(homeOnly?'homepage':'all public pages')+' assembled. Local GSAP + Lenis motion built.');
