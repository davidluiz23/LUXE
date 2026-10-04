import {gsap} from 'gsap';
import {ScrollTrigger} from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';

gsap.registerPlugin(ScrollTrigger);
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const originals = [
  {key:'ijele',name:'Ijele',image:'assets/products/ijele.jpg',alt:'The original black Ijele graphic tee'},
  {key:'durbar',name:'Durbar',image:'assets/products/durbar.jpg',alt:'The original black Durbar graphic tee'},
  {key:'dun-dun',name:'Dùn Dùn',image:'assets/products/dun-dun.jpg',alt:'The original black Dùn Dùn graphic tee'},
];
let destroy = () => {};

function start() {
  destroy();
  const events = new AbortController();
  const {signal} = events;
  let live = true;
  let motionCleanup = () => {};
  let pieces = originals.map(piece=>({...piece}));
  let selected = pieces[0];
  let selectionRequest = 0;
  let selectedByVisitor = false;
  const artwork = document.getElementById('cultureStage');
  const shirt = document.getElementById('cultureShirt');
  const artStatus = document.getElementById('culturePieceStatus');
  const artControls = document.querySelector('.culture-piece-select');

  function catalogLinks() {
    const catalog = window.getProducts?.() || [];
    document.querySelectorAll('[data-piece-link]').forEach(link=>{
      const piece=pieces.find(p=>p.key===link.dataset.pieceLink) || originals.find(p=>p.key===link.dataset.pieceLink);
      if(!piece)return;
      const matches=catalog.filter(p=>piece.productId ? String(p.id)===String(piece.productId) : window.LuxeCollection?.keyForProduct(p)===piece.key);
      const product=matches.length===1?matches[0]:null;
      link.href=product?'product.html?id='+encodeURIComponent(product.id):'product.html?piece='+encodeURIComponent(piece.key);
      link.setAttribute('aria-label',product?'View '+product.name:'Explore '+piece.name+' in the collection');
    });
    document.querySelectorAll('[data-piece-price]').forEach(label=>{
      const matches=catalog.filter(p=>window.LuxeCollection?.keyForProduct(p)===label.dataset.piecePrice);
      // Render the backend's real prices only. Editorial images never create inventory.
      if(matches.length===1 && Number.isFinite(Number(matches[0].price))) {
        label.textContent=window.LuxeMoney?.forProduct?.(matches[0]).text || new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(matches[0].price);
      } else label.textContent='Graphic tee';
    });
  }
  catalogLinks();
  Promise.resolve(window.productsReady).then(()=>{if(live){catalogLinks();publishedContent();}}).catch(()=>{});
  window.addEventListener('luxe:catalog-status',catalogLinks,{signal});

  async function selectPiece(next,force=false) {
    if(!artwork||!next||(!force&&next===selected))return;
    const request=++selectionRequest;
    artwork.setAttribute('aria-busy','true');
    const image=new Image();image.src=next.image;
    try {await image.decode();}catch{
      if(live&&request===selectionRequest){artStatus.textContent='This artwork could not load. Please try again.';artwork.removeAttribute('aria-busy');}
      return;
    }
    if(!live||request!==selectionRequest)return;
    selected=next;if(!force)selectedByVisitor=true;
    shirt.src=image.src;shirt.alt=next.alt;
    artwork.dataset.selected=next.key;
    artwork.dataset.customPhoto=String(!originals.some(p=>p.key===next.key&&p.image===next.image));
    document.getElementById('culturePieceName').textContent=next.name;
    artwork.querySelector('[data-piece-link]').dataset.pieceLink=next.key;
    artControls.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.piece===next.key)));
    artStatus.textContent=next.name+' artwork selected.';artwork.removeAttribute('aria-busy');
    catalogLinks();
    if(!reduced.matches){gsap.killTweensOf(shirt);gsap.fromTo(shirt,{opacity:.5,y:14},{opacity:1,y:0,duration:.5,ease:'power2.out',clearProps:'opacity,transform'});}
  }
  artControls?.addEventListener('click',e=>{const b=e.target.closest('[data-piece]');if(b)selectPiece(pieces.find(p=>p.key===b.dataset.piece));},{signal});
  artControls?.addEventListener('keydown',e=>{
    const controls=[...artControls.querySelectorAll('button')],i=controls.indexOf(document.activeElement);
    if(i<0||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
    e.preventDefault();const n=e.key==='Home'?0:e.key==='End'?controls.length-1:(i+(e.key==='ArrowRight'?1:-1)+controls.length)%controls.length;
    controls[n].focus();selectPiece(pieces.find(p=>p.key===controls[n].dataset.piece));
  },{signal});

  function publishedContent() {
    if(!artwork)return;
    const content=window.LuxeSiteContent?.snapshot?.().content;
    if(!content?.slides?.length)return;
    const catalog=window.getProducts?.()||[];
    const next=content.slides.filter(slide=>originals.some(p=>p.key===slide.id)||catalog.some(p=>String(p.id)===String(slide.productId))).map(slide=>({key:slide.id,name:slide.title,image:slide.image,alt:slide.alt,productId:slide.productId}));
    if(!next.length||JSON.stringify(next)===JSON.stringify(pieces))return;
    const focusedPiece=artControls.contains(document.activeElement)?document.activeElement.dataset.piece:null;
    pieces=next;const fragment=document.createDocumentFragment();
    pieces.forEach((p,i)=>{const b=document.createElement('button');b.type='button';b.dataset.piece=p.key;b.setAttribute('aria-pressed',String(selected.key===p.key));const number=document.createElement('span');number.textContent=String(i+1).padStart(2,'0');b.append(number,document.createTextNode(' '+p.name));fragment.append(b);});
    artControls.replaceChildren(fragment);
    if(focusedPiece)[...artControls.children].find(b=>b.dataset.piece===focusedPiece)?.focus({preventScroll:true});
    selectPiece((selectedByVisitor&&pieces.find(p=>p.key===selected.key))||pieces[0],true);
  }
  publishedContent();window.addEventListener('luxe:site-content',publishedContent,{signal});

  const stage=document.getElementById('campaignStage');
  const controls=stage?.querySelector('.campaign-controls');
  const poses=stage?[...stage.querySelectorAll('[data-pose-image]')]:[];
  const status=document.getElementById('campaignStatus');
  let index=0,request=0,timer=0,manualPause=false,inView=true,hovering=false,focusing=false,explicitPlay=false,transition=null;
  const pauseButton=stage?.querySelector('[data-pose-pause]');
  const canPlay=()=>live&&!manualPause&&!reduced.matches&&!document.hidden&&inView&&(explicitPlay||(!hovering&&!focusing));
  function updatePlayback() {
    clearTimeout(timer);
    if(pauseButton){const paused=manualPause||reduced.matches;pauseButton.hidden=reduced.matches;pauseButton.setAttribute('aria-label',paused?'Play campaign slideshow':'Pause campaign slideshow');pauseButton.querySelector('[data-play-icon]').textContent=paused?'▶':'Ⅱ';}
    if(stage)stage.dataset.playback=canPlay()?'playing':'paused';
    if(canPlay()&&poses.length>1)timer=setTimeout(()=>changePose((index+1)%poses.length,false),6500);
  }
  async function loadPose(n) {
    const img=poses[n];
    if(img.dataset.src){if(img.dataset.srcset)img.srcset=img.dataset.srcset;img.src=img.dataset.src;delete img.dataset.src;}
    await img.decode();return img;
  }
  async function changePose(n,manual=true) {
    if(!stage||n===index)return;
    clearTimeout(timer);const thisRequest=++request;
    if(manual){manualPause=true;explicitPlay=false;updatePlayback();}
    let next;
    try {next=await loadPose(n);}catch{if(live&&thisRequest===request){if(manual)status.textContent='This pose could not load. Please try again.';updatePlayback();}return;}
    if(!live||thisRequest!==request)return;
    transition?.kill();gsap.killTweensOf(poses);
    const previous=poses[index];
    poses.forEach((img,i)=>{if(i!==index&&i!==n){img.hidden=true;img.classList.remove('is-active');gsap.set(img,{clearProps:'all'});}});
    next.hidden=false;next.classList.add('is-active');next.setAttribute('aria-hidden','false');previous.setAttribute('aria-hidden','true');
    index=n;stage.dataset.pose=String(index);
    stage.querySelectorAll('[data-pose-select]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.poseSelect)===index)));
    const finish=()=>{poses.forEach((img,i)=>{img.hidden=i!==index;img.classList.toggle('is-active',i===index);});gsap.set(poses,{clearProps:'opacity,transform,visibility'});transition=null;updatePlayback();};
    if(reduced.matches)finish();else {
      gsap.set(next,{opacity:0,visibility:'visible',y:12,scale:1.012});
      transition=gsap.timeline({onComplete:finish}).to(previous,{opacity:0,y:-6,duration:.85,ease:'power1.inOut'},0).to(next,{opacity:1,y:0,scale:1,duration:1.25,ease:'power2.inOut'},0);
    }
    if(manual)status.textContent='Campaign pose '+(index+1)+' of '+poses.length+'.';
  }
  if(stage){
    controls.hidden=false;
    stage.querySelector('[data-pose-prev]').addEventListener('click',()=>changePose((index+poses.length-1)%poses.length),{signal});
    stage.querySelector('[data-pose-next]').addEventListener('click',()=>changePose((index+1)%poses.length),{signal});
    stage.querySelectorAll('[data-pose-select]').forEach(b=>b.addEventListener('click',()=>changePose(Number(b.dataset.poseSelect)),{signal}));
    pauseButton.addEventListener('click',()=>{if(reduced.matches)return;manualPause=!manualPause;explicitPlay=!manualPause;updatePlayback();},{signal});
    stage.addEventListener('pointerenter',e=>{if(e.pointerType==='mouse'){hovering=true;explicitPlay=false;updatePlayback();}},{signal});
    stage.addEventListener('pointerleave',()=>{hovering=false;updatePlayback();},{signal});
    stage.addEventListener('focusin',e=>{if(!stage.contains(e.relatedTarget))explicitPlay=false;focusing=true;updatePlayback();},{signal});
    stage.addEventListener('focusout',e=>{if(!stage.contains(e.relatedTarget)){focusing=false;updatePlayback();}},{signal});
    controls.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();changePose(e.key==='Home'?0:e.key==='End'?poses.length-1:(index+(e.key==='ArrowRight'?1:-1)+poses.length)%poses.length);},{signal});
  }
  const visibilityObserver=stage&&'IntersectionObserver'in window?new IntersectionObserver(entries=>{inView=entries[0].isIntersecting;updatePlayback();},{threshold:.15}):null;
  visibilityObserver?.observe(stage);
  document.addEventListener('visibilitychange',()=>{transition?.paused(document.hidden);updatePlayback();},{signal});

  function motion() {
    motionCleanup();
    if(reduced.matches||!live){transition?.progress(1);if(stage)stage.dataset.drawing='complete';updatePlayback();return;}
    let lenis;
    if(!navigator.connection?.saveData){lenis=new Lenis({duration:1.05,smoothWheel:true,syncTouch:false,anchors:{offset:-110},prevent:node=>!!node.closest?.('.nav-menu-overlay,.header-search-modal,.shop-sidebar,.product-lightbox,[data-lenis-prevent]')});lenis.on('scroll',ScrollTrigger.update);}
    const tick=time=>lenis?.raf(time*1000);if(lenis)gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
    const context=gsap.context(()=>{
      const paths=[...document.querySelectorAll('[data-portrait-stroke]')];
      if(paths.length){
        stage.dataset.drawing='drawing';
        const timeline=gsap.timeline({delay:.15,onComplete:()=>{stage.dataset.drawing='complete';}});
        const total=paths.reduce((n,p)=>n+p.getTotalLength(),0);let at=0;
        paths.forEach(path=>{const length=path.getTotalLength(),duration=Math.max(.18,length/total*4.2);gsap.set(path,{strokeDasharray:length,strokeDashoffset:length});timeline.to(path,{strokeDashoffset:0,duration,ease:'none'},at);at+=duration*.88;});
      }
      gsap.utils.toArray('[data-reveal]').forEach(element=>{
        // Sections remain visible in source; every hidden state belongs to this context.
        gsap.from(element,{y:22,opacity:0,duration:.8,ease:'power2.out',scrollTrigger:{trigger:element,start:'top 94%',once:true}});
      });
    });
    document.documentElement.dataset.modernMotion='ready';
    motionCleanup=()=>{gsap.ticker.remove(tick);context.revert();lenis?.stop();lenis?.destroy();delete document.documentElement.dataset.modernMotion;if(stage)stage.dataset.drawing='complete';};
    updatePlayback();
    document.fonts?.ready.then(()=>{if(live)ScrollTrigger.refresh();});
  }
  reduced.addEventListener('change',motion,{signal});
  motion();updatePlayback();
  destroy=()=>{live=false;request++;selectionRequest++;events.abort();clearTimeout(timer);transition?.kill();gsap.killTweensOf(poses);if(shirt)gsap.killTweensOf(shirt);visibilityObserver?.disconnect();motionCleanup();};
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
window.addEventListener('pagehide',()=>destroy());
window.addEventListener('pageshow',event=>{if(event.persisted)start();});
