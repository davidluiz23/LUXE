import {gsap} from 'gsap';
import {ScrollTrigger} from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';
import {createScrollChapters} from './chapters.mjs';

gsap.registerPlugin(ScrollTrigger);
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const fine = matchMedia('(hover: hover) and (pointer: fine)');
const originalPieces = [
  {key:'ijele',name:'Ijele',match:/\bijele\b/,alt:'The original black Ijele tee with intricate artwork and warm lettering'},
  {key:'durbar',name:'Durbar',match:/\bdurbar\b/,alt:'The original black Durbar tee with gold lettering and a mounted figure print'},
  {key:'dun-dun',name:'Dùn Dùn',match:/\bdun[\s-]+dun\b/,alt:'The original black Dùn Dùn tee with yellow lettering and three drummers'},
];
const normalize = value => String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
let destroyPage = () => {};

function start() {
  destroyPage();
  const events = new AbortController();
  const {signal} = events;
  let live = true;
  let disposeMotion = () => {};
  let disposeArt = () => {};
  let artRequest = 0;
  let pieces = originalPieces.map(piece=>({...piece,image:`assets/products/${piece.key}.jpg`}));
  let selected = pieces[0];
  let selectedByVisitor = false;
  let selectionRequest = 0;
  const stage = document.getElementById('cultureStage');
  const shirt = document.getElementById('cultureShirt');
  const selectionVisual = shirt?.closest('.canvas-shirt-motion') || shirt;
  const status = document.getElementById('culturePieceStatus');
  const controlGroup = document.querySelector('.culture-piece-select');
  let controls = [...document.querySelectorAll('[data-piece]')];

  function catalogLinks() {
    const catalog = window.getProducts?.() || [];
    document.querySelectorAll('[data-piece-link]').forEach(link=>{
      const piece = pieces.find(piece=>piece.key===link.dataset.pieceLink) || originalPieces.find(piece=>piece.key===link.dataset.pieceLink);
      if (!piece) return;
      const matches = piece.productId
        ? catalog.filter(product=>String(product.id)===String(piece.productId))
        : catalog.filter(product=>normalize(product.brand).trim()==='alkebulan' && piece.match?.test(normalize(product.name)));
      const product = matches.length===1 ? matches[0] : null;
      link.href = product ? `product.html?id=${encodeURIComponent(product.id)}` : 'shop.html';
      link.setAttribute('aria-label',product ? `View ${product.name}` : `Explore ${piece.name} in the collection`);
    });
  }
  catalogLinks();
  Promise.resolve(window.productsReady).then(()=>{if(live)catalogLinks();}).catch(()=>{});
  window.addEventListener('luxe:catalog-status',catalogLinks,{signal});

  async function selectPiece(next,force=false) {
    if (!next || (!force && next===selected) || !shirt) return;
    const request = ++selectionRequest;
    const image = new Image(); image.src=next.image;
    stage.setAttribute('aria-busy','true');
    try { await image.decode(); } catch {
      if (live && request===selectionRequest) {
        status.textContent='This artwork could not load. Please try again.';
        stage.removeAttribute('aria-busy');
      }
      return;
    }
    if (!live || request!==selectionRequest) return;
    selected=next;
    if(!force)selectedByVisitor=true;
    shirt.src=image.src;shirt.alt=next.alt;
    stage.dataset.selected=next.key;
    stage.dataset.customPhoto=String(!originalPieces.some(piece=>piece.key===next.key && next.image===`assets/products/${piece.key}.jpg`));
    stage.querySelector('[data-piece-link]').dataset.pieceLink=next.key;
    document.getElementById('culturePieceName').textContent=next.name;
    controls.forEach(control=>control.setAttribute('aria-pressed',String(control.dataset.piece===next.key)));
    status.textContent=`${next.name} artwork selected.`;
    stage.removeAttribute('aria-busy');
    catalogLinks();
    if (!reduced.matches) {
      gsap.killTweensOf(selectionVisual);
      gsap.fromTo(selectionVisual,{opacity:.45,y:16},{opacity:1,y:0,duration:.5,ease:'power2.out',clearProps:'opacity,transform'});
    }
  }
  controlGroup?.addEventListener('click',event=>{
    const button=event.target.closest('[data-piece]');
    if(button)selectPiece(pieces.find(piece=>piece.key===button.dataset.piece));
  },{signal});

  function publishedContent() {
    if(!stage)return;
    const content=window.LuxeSiteContent?.snapshot?.().content;
    if(!content?.slides?.length)return;
    const next=content.slides.map(slide=>{
      const original=originalPieces.find(piece=>piece.key===slide.id);
      return {key:slide.id,name:slide.title,image:slide.image,alt:slide.alt,productId:slide.productId,match:original?.match};
    });
    if(JSON.stringify(next.map(({key,name,image,alt,productId})=>({key,name,image,alt,productId})))===JSON.stringify(pieces.map(({key,name,image,alt,productId})=>({key,name,image,alt,productId}))))return;
    pieces=next;
    const fragment=document.createDocumentFragment();
    pieces.forEach((piece,index)=>{
      const button=document.createElement('button');button.type='button';button.dataset.piece=piece.key;button.setAttribute('aria-pressed',String(piece.key===selected.key));
      const number=document.createElement('span');number.textContent=String(index+1).padStart(2,'0');button.append(number,document.createTextNode(' '+piece.name));fragment.append(button);
    });
    controlGroup.replaceChildren(fragment);controls=[...controlGroup.children];
    // Published ordering owns the initial hero; an explicit visitor choice
    // survives a later content refresh when that artwork still exists.
    selectPiece((selectedByVisitor && pieces.find(piece=>piece.key===selected.key))||pieces[0],true);
  }
  publishedContent();
  window.addEventListener('luxe:site-content',publishedContent,{signal});

  function motion() {
    disposeMotion();
    if (reduced.matches || !live) return;
    let lenis;
    const localEvents = new AbortController();
    const localSignal = localEvents.signal;
    const originals = [];
    // Native touch remains native. One engine owns desktop smoothing.
    if (!navigator.connection?.saveData) {
      lenis=new Lenis({duration:1.05,smoothWheel:true,syncTouch:false,anchors:{offset:-105},prevent:node=>!!node.closest?.('.nav-menu-overlay,.header-search-modal,.shop-sidebar,.product-lightbox,[data-lenis-prevent]')});
      lenis.on('scroll',ScrollTrigger.update);
    }
    const tick = time => lenis?.raf(time*1000);
    if (lenis) gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
    const context = gsap.context(()=>{
      let introSeen=false;
      try{introSeen=sessionStorage.getItem('alkebulan:intro-seen')==='true';}catch{}
      if (document.querySelector('.culture-hero') && !introSeen) {
        try{sessionStorage.setItem('alkebulan:intro-seen','true');}catch{}
        const intro = gsap.timeline({defaults:{ease:'power3.out'}});
        intro.from('.hero-line',{y:35,opacity:.55,duration:1,stagger:.11},0)
          .from('.culture-shirt-wrap',{y:25,rotation:-6,duration:1.3},.1)
          .from('.culture-hero-copy > p,.culture-hero-copy > a',{y:14,opacity:.55,duration:.8,stagger:.08},.15);
      }
      document.querySelectorAll('[data-reveal]').forEach(heading=>{
        if (heading.querySelector('a,button')) return;
        originals.push([heading,heading.innerHTML,heading.getAttribute('aria-label')]);
        heading.setAttribute('aria-label',heading.textContent.replace(/\s+/g,' ').trim());
        const walker=document.createTreeWalker(heading,NodeFilter.SHOW_TEXT);
        const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
        nodes.forEach(node=>{
          const fragment=document.createDocumentFragment();
          node.textContent.split(/(\s+)/).forEach(word=>{
            if (!word.trim()) {fragment.append(document.createTextNode(word));return;}
            const span=document.createElement('span');span.className='culture-word';span.setAttribute('aria-hidden','true');span.textContent=word;fragment.append(span);
          });node.replaceWith(fragment);
        });
        gsap.from(heading.querySelectorAll('.culture-word'),{y:22,opacity:.25,duration:.75,stagger:.04,ease:'power2.out',scrollTrigger:{trigger:heading,start:'top 92%',once:true}});
      });
      document.querySelectorAll('.culture-piece-card,.canvas-piece-card').forEach((card,index)=>{
        gsap.from(card,{y:35,duration:.9,delay:index*.06,ease:'power2.out',scrollTrigger:{trigger:card,start:'top 95%',once:true}});
      });
      const ribbon=document.querySelector('.culture-ribbon > div');
      if (ribbon) gsap.to(ribbon,{x:-160,ease:'none',scrollTrigger:{trigger:ribbon.parentElement,start:'top bottom',end:'bottom top',scrub:1}});
    });
    const disposeChapters=createScrollChapters(y=>{if(lenis)lenis.scrollTo(y,{immediate:true});else window.scrollTo({top:y,behavior:'instant'});});
    const hero = document.querySelector('.canvas-hero,.culture-hero');
    const product = document.querySelector('.canvas-hero-product,.culture-hero-product');
    if(hero && product && fine.matches) {
      const moveX=gsap.quickTo(product,'x',{duration:.9,ease:'power2.out'});
      const moveY=gsap.quickTo(product,'y',{duration:.9,ease:'power2.out'});
      hero.addEventListener('pointermove',event=>{
        if(event.pointerType!=='mouse')return;
        const bounds=hero.getBoundingClientRect();moveX(((event.clientX-bounds.left)/bounds.width-.5)*12);moveY(((event.clientY-bounds.top)/bounds.height-.5)*10);
      },{passive:true,signal:localSignal});
      const reset=()=>{moveX(0);moveY(0);};
      hero.addEventListener('pointerleave',reset,{signal:localSignal});
      window.addEventListener('blur',reset,{signal:localSignal});
    }
    const syncScroll=()=>{
      if(document.hidden || document.body.matches('.mobile-nav-open,.search-is-open,.filters-open'))lenis?.stop();
      else lenis?.start();
    };
    const lockObserver=new MutationObserver(syncScroll);lockObserver.observe(document.body,{attributes:true,attributeFilter:['class']});
    document.addEventListener('visibilitychange',syncScroll,{signal:localSignal});
    const refresh=()=>{if(live){lenis?.resize();ScrollTrigger.refresh();}};
    document.fonts.ready.then(()=>{if(!localSignal.aborted)refresh();});
    window.addEventListener('load',refresh,{once:true,signal:localSignal});
    const resizeObserver=new ResizeObserver(()=>{lenis?.resize();});resizeObserver.observe(document.body);
    disposeMotion=()=>{
      localEvents.abort();lockObserver.disconnect();resizeObserver.disconnect();disposeChapters();context.revert();
      originals.forEach(([heading,html,label])=>{heading.innerHTML=html;if(label===null)heading.removeAttribute('aria-label');else heading.setAttribute('aria-label',label);});
      if(product){gsap.killTweensOf(product);gsap.set(product,{clearProps:'transform'});}
      gsap.ticker.remove(tick);lenis?.destroy();
    };
  }

  async function artwork() {
    const request=++artRequest;
    disposeArt();disposeArt=()=>{};
    const hosts=[...document.querySelectorAll('[data-liquid-art]')];
    const buttons=[...document.querySelectorAll('.culture-motion')];
    buttons.forEach(button=>{button.hidden=true;});
    if (!hosts.length || reduced.matches || navigator.connection?.saveData || !live) return;
    try {
      const {createLiquid}=await import('./liquid.mjs');
      if(!live || request!==artRequest || reduced.matches)return;
      const instances=await Promise.all(hosts.map(host=>createLiquid(host)));
      if(!live || request!==artRequest || reduced.matches){instances.forEach(instance=>instance?.dispose());return;}
      const active=instances.filter(Boolean);
      if(!active.length)return;
      let paused=false;
      const controller=new AbortController();
      buttons.forEach(button=>{
        button.hidden=false;button.setAttribute('aria-pressed','false');button.setAttribute('aria-label','Pause background artwork');
        button.innerHTML='Pause artwork <span aria-hidden="true">Ⅱ</span>';
        button.addEventListener('click',()=>{
          paused=!paused;active.forEach(instance=>instance.pause(paused));
          buttons.forEach(control=>{control.setAttribute('aria-pressed',String(paused));control.setAttribute('aria-label',paused?'Play background artwork':'Pause background artwork');control.innerHTML=paused?'Play artwork <span aria-hidden="true">▷</span>':'Pause artwork <span aria-hidden="true">Ⅱ</span>';});
        },{signal:controller.signal});
      });
      disposeArt=()=>{controller.abort();active.forEach(instance=>instance.dispose());buttons.forEach(button=>{button.hidden=true;});};
    } catch { hosts.forEach(host=>{host.dataset.artState='still';}); }
  }
  motion();artwork();
  document.addEventListener('culture:art-failed',()=>{disposeArt();disposeArt=()=>{};},{signal});
  reduced.addEventListener('change',()=>{motion();artwork();},{signal});
  destroyPage=()=>{live=false;++artRequest;++selectionRequest;events.abort();disposeMotion();disposeArt();if(selectionVisual)gsap.killTweensOf(selectionVisual);};
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
window.addEventListener('pagehide',()=>destroyPage());
window.addEventListener('pageshow',event=>{if(event.persisted)start();});
