// Mechanical asset preparation: retain originals, encode responsive WebP,
// derive an animation mask from the generated artwork's actual pixels.
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '../..');
const originals = path.join(root, 'output/imagegen/african-modern-production');
const out = path.join(root, 'Frontend/assets/african-modern');
const generated = 'C:/Users/OWNER/.codex/generated_images/01a0f5f0-4fe1-7900-8231-ade538245f75';
const inputs = {
  'pose-01':'exec-2220a9e6-6d62-4800-8bc3-c359079d0b4d.png',
  'pose-02':'exec-2bde42f0-a5f2-49e9-8d53-a439cca1fbb6.png',
  'pose-03':'exec-81e72265-4054-4365-97ac-0b14e4228d7f.png',
  'red-portrait':'exec-a3fec338-ad46-4fc5-935b-4f461d4fae98.png'
};
fs.mkdirSync(originals,{recursive:true}); fs.mkdirSync(out,{recursive:true});
function skeletonize(mask,w,h) {
  let changed=true;
  const at=(x,y)=>mask[y*w+x];
  while(changed) {
    changed=false;
    for(let step=0;step<2;step++) {
      const remove=[];
      for(let y=1;y<h-1;y++) for(let x=1;x<w-1;x++) {
        if(!at(x,y)) continue;
        const p=[at(x,y-1),at(x+1,y-1),at(x+1,y),at(x+1,y+1),at(x,y+1),at(x-1,y+1),at(x-1,y),at(x-1,y-1)];
        const b=p.reduce((a,b)=>a+b,0);
        let a=0;for(let i=0;i<8;i++)if(p[i]===0&&p[(i+1)%8]===1)a++;
        if(b<2||b>6||a!==1)continue;
        if(step===0 ? p[0]*p[2]*p[4]===0&&p[2]*p[4]*p[6]===0 : p[0]*p[2]*p[6]===0&&p[0]*p[4]*p[6]===0) remove.push(y*w+x);
      }
      for(const i of remove)mask[i]=0;
      if(remove.length)changed=true;
    }
  }
  return mask;
}
function trace(mask,w,h) {
  const neighbors=i=>{const x=i%w,y=Math.floor(i/w),n=[]; for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++)if((dx||dy)&&x+dx>=0&&x+dx<w&&y+dy>=0&&y+dy<h&&mask[i+dy*w+dx]) {
    // Suppress diagonal shortcuts where an orthogonal connection exists.
    if(dx&&dy&&(mask[i+dx]||mask[i+dy*w]))continue;
    n.push(i+dy*w+dx);
  }return n;};
  const graph=new Map();for(let i=0;i<mask.length;i++)if(mask[i])graph.set(i,neighbors(i));
  const used=new Set(),edges=[];
  const key=(a,b)=>a<b?a+':'+b:b+':'+a;
  const starts=[...graph.keys()].sort((a,b)=>(graph.get(a).length===2)-(graph.get(b).length===2));
  for(const start of starts)for(const next of graph.get(start)) {
    if(used.has(key(start,next)))continue;
    let prev=start,curr=next;const pts=[start];used.add(key(prev,curr));
    while(true){pts.push(curr);const ns=graph.get(curr);if(ns.length!==2)break;const n=ns.find(v=>v!==prev);if(used.has(key(curr,n)))break;used.add(key(curr,n));prev=curr;curr=n;}
    if(pts.length>3)edges.push(pts);
  }
  // Stitch junction edges into long runs, favouring the straightest continuation.
  const trails=[];
  while(edges.length){const trail=edges.splice(edges.reduce((best,e,i)=>e.length>edges[best].length?i:best,0),1)[0];let extended=true;
    while(extended){extended=false;for(let end=0;end<2;end++){
      if(end)trail.reverse();const last=trail.at(-1),before=trail[Math.max(0,trail.length-7)];
      let best=-1,flip=false,score=-Infinity;
      edges.forEach((e,i)=>{for(const reverse of [false,true]){const a=reverse?e.at(-1):e[0];if(a!==last)continue;const b=reverse?e[Math.max(0,e.length-7)]:e[Math.min(6,e.length-1)];const vx=last%w-before%w,vy=Math.floor(last/w)-Math.floor(before/w),ux=b%w-last%w,uy=Math.floor(b/w)-Math.floor(last/w);const s=(vx*ux+vy*uy)/(Math.hypot(vx,vy)*Math.hypot(ux,uy)||1);if(s>score){score=s;best=i;flip=reverse;}}});
      if(best>=0){const e=edges.splice(best,1)[0];if(flip)e.reverse();trail.push(...e.slice(1));extended=true;}
      if(end)trail.reverse();
    }}
    if(trail.length>25)trails.push(trail);
  }
  return trails.sort((a,b)=>b.length-a.length).map(t=>{
    const points=t.filter((v,i)=>i%3===0||i===t.length-1).map(i=>[i%w,Math.floor(i/w)]);
    return {length:t.length,d:points.map((p,i)=>(i?'L':'M')+p.join(',')).join(' ')};
  });
}
(async()=>{
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  try {const page=await browser.newPage({viewport:{width:1080,height:950}});
    for(const [name,file] of Object.entries(inputs)){
      const dest=path.join(originals,name+'.png');if(!fs.existsSync(dest))fs.copyFileSync(path.join(generated,file),dest);
      const data='data:image/png;base64,'+fs.readFileSync(dest).toString('base64');
      const result=await page.evaluate(async({data,name})=>{
        const img=new Image();img.src=data;await img.decode();
        const canv=document.createElement('canvas');const ctx=canv.getContext('2d',{willReadFrequently:true});
        const versions=[];
        for(const width of name==='red-portrait'?[1024]:[640,1024]){canv.width=width;canv.height=Math.round(img.height*width/img.width);ctx.drawImage(img,0,0,canv.width,canv.height);versions.push({width,height:canv.height,data:canv.toDataURL('image/webp',.91).split(',')[1]});}
        let pixels=null;
        if(name==='red-portrait'){canv.width=512;canv.height=512;ctx.clearRect(0,0,512,512);ctx.drawImage(img,0,0,512,512);const rgba=ctx.getImageData(0,0,512,512).data;pixels=Array.from({length:512*512},(_,i)=>rgba[i*4+3]>90&&rgba[i*4]>140&&rgba[i*4]>rgba[i*4+1]*1.4?1:0);}
        return {versions,pixels,source:[img.width,img.height]};
      },{data,name});
      for(const v of result.versions)fs.writeFileSync(path.join(out,name+(name==='red-portrait'?'':'-'+v.width)+'.webp'),Buffer.from(v.data,'base64'));
      if(result.pixels){const paths=trace(skeletonize(Uint8Array.from(result.pixels),512,512),512,512);fs.writeFileSync(path.join(__dirname,'portrait-paths.json'),JSON.stringify({width:512,height:512,paths}));console.log('Portrait mask paths',paths.map(p=>p.length));}
      console.log(name,result.source,result.versions.map(v=>({w:v.width,bytes:Math.round(v.data.length*.75)})));
    }
    await page.setContent('<style>body{margin:0;background:#faf7f0;display:flex;align-items:center;justify-content:center}img{height:940px;max-width:100%;object-fit:contain}</style><img src="data:image/png;base64,'+fs.readFileSync(path.join(originals,'pose-01.png')).toString('base64')+'">');
    await page.locator('img').evaluate(el=>el.decode());
    fs.mkdirSync(path.join(root,'artifacts/african-modern'),{recursive:true});
    await page.screenshot({path:path.join(root,'artifacts/african-modern/asset-alpha-check.png')});
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
