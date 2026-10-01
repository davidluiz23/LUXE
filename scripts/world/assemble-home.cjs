const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const file = path.join(root, 'Frontend/index.html');
let html = fs.readFileSync(file, 'utf8');
const header = fs.readFileSync(path.join(__dirname, 'header.html'), 'utf8').trim().replace(/@@([a-z0-9-]+)@@/g, (_, name) => fs.readFileSync(path.join(root, 'Frontend/assets/icons', name + '.svg'), 'utf8').replace('<svg ', '<svg class="nav-svg-icon" aria-hidden="true" focusable="false" '));
html = html.replace(/<header\b[\s\S]*?<\/header>(?:\s*<noscript>[\s\S]*?<\/noscript>)?/, header);
html = html.replace(/<main id="mainContent">[\s\S]*?<\/main>/, fs.readFileSync(path.join(__dirname, 'home.html'), 'utf8').trim());
html = html.replace(/<body class="[^"]*">/, '<body class="page-index world-home">');
for (const file of ['home', 'art-direction', 'atelier', 'editorial-commerce', 'house-photography', 'streetwear', 'world']) {
  html = html.replace(new RegExp('<link[^>]*href="css/' + file + '\\.css[^"]*"[^>]*>', 'g'), '');
}
for (const file of ['home-stage', 'heritage-scene', 'art-direction', 'atelier', 'culture-field', 'animation']) {
  html = html.replace(new RegExp('<script[^>]*src="js/' + file + '\\.js[^"]*"[^>]*><\\/script>', 'g'), '');
}
html = html.replace(/<link[^>]*href="js\/world\/experience\.css[^"]*"[^>]*>/g, '')
  .replace(/<script[^>]*src="js\/world\/experience\.js[^"]*"[^>]*><\/script>/g, '');
html = html.replace('</head>', '<link rel="stylesheet" href="css/world.css?v=20260921-1" />\n    <link rel="stylesheet" href="js/world/experience.css?v=20260921-1" />\n    <script type="module" src="js/world/experience.js?v=20260921-1"></script>\n  </head>');
html = html.replace(/(?:\n[ \t]*){3,}/g, '\n\n    ');
fs.writeFileSync(file, html);
for (const name of ['desktop', 'tablet', 'mobile']) {
  const poster = path.join(root, 'Frontend/assets/heritage/gallery-' + name + '.webp');
  if (!fs.existsSync(poster)) fs.copyFileSync(path.join(root, 'Frontend/assets/heritage/terracotta-study.webp'), poster);
}
console.log('Assembled homepage from the gallery template.');
