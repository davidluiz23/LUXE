const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '../..');
async function main() {
  const fonts = path.join(root, 'Frontend/assets/fonts');
  const fontPath = path.join(fonts, 'barlow-condensed-600-latin.woff2');
  if (!fs.existsSync(fontPath)) {
    const response = await fetch('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600&display=swap', {headers:{'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'}});
    if (!response.ok) throw new Error('Font stylesheet unavailable');
    const css = await response.text();
    const url = [...css.matchAll(/url\((https[^)]+)\)/g)].at(-1)?.[1];
    if (!url) throw new Error('Font URL missing');
    const font = await fetch(url);
    if (!font.ok) throw new Error('Font unavailable');
    fs.writeFileSync(fontPath, Buffer.from(await font.arrayBuffer()));
    const license = await fetch('https://raw.githubusercontent.com/google/fonts/main/ofl/barlowcondensed/OFL.txt');
    if (!license.ok) throw new Error('Font license unavailable');
    fs.writeFileSync(path.join(fonts,'barlow-condensed-OFL.txt'), await license.text());
  }
  const supplied = process.argv[2];
  if (!supplied) return;
  const slug = process.argv[3] || 'living-pigment';
  if (!/^[a-z0-9-]+$/.test(slug)) throw new Error('Use a simple asset name');
  const original = path.join(root, 'source-assets/culture');
  const output = path.join(root, 'Frontend/assets/culture');
  fs.mkdirSync(original, {recursive:true}); fs.mkdirSync(output, {recursive:true});
  fs.copyFileSync(supplied, path.join(original, slug + '.png'));
  const executablePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));
  const browser = await chromium.launch({executablePath,headless:true});
  try {
    const page = await browser.newPage();
    const source = 'data:image/png;base64,' + fs.readFileSync(supplied).toString('base64');
    for (const width of [1536,768]) {
      const data = await page.evaluate(async ({source,width})=>{
        const img = new Image(); img.src=source; await img.decode();
        const canvas = document.createElement('canvas');canvas.width=width;canvas.height=Math.round(width*img.height/img.width);
        canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
        return canvas.toDataURL('image/webp',.87).split(',')[1];
      },{source,width});
      fs.writeFileSync(path.join(output,slug+(width===1536?'':'-mobile')+'.webp'),Buffer.from(data,'base64'));
    }
  } finally { await browser.close(); }
  console.log('Local font, license, original artwork and responsive WebP assets saved.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
