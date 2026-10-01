import {WebGLRenderer,Scene,OrthographicCamera,PlaneGeometry,ShaderMaterial,Mesh,TextureLoader,Vector2,SRGBColorSpace,LinearFilter} from 'three';

// Animate the supplied orange artwork itself. The shader only displaces its
// texture coordinates: every line and color still comes from that exact image.
const vertex=`varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`;
const fragment=`
  uniform sampler2D uPainting;
  uniform vec2 uCover;
  uniform vec2 uPointer;
  uniform vec2 uVelocity;
  uniform float uTime;
  uniform float uAspect;
  uniform float uStrength;
  uniform float uScroll;
  varying vec2 vUv;
  void main(){
    float t=uTime;
    vec2 p=vec2(vUv.x*uAspect,vUv.y);
    // Two slow, independent currents gently bend the actual printed lines.
    vec2 flow=vec2(
      sin(p.y*5.2+t*.27+sin(p.x*2.1-t*.13)),
      cos(p.x*4.3-t*.19+sin(p.y*3.4+t*.11))
    )*.019;
    vec2 d=p-vec2(uPointer.x*uAspect,uPointer.y);
    float dist=length(d);
    float influence=exp(-dist*dist/.055);
    // Inverse sampling pushes the visible artwork away from the pointer.
    vec2 push=d/(dist+.045)*influence*uStrength*.085;
    vec2 wake=vec2(uVelocity.x*uAspect,uVelocity.y)*influence*.055;
    vec2 tide=vec2(sin(uScroll*.31)*.008,cos(uScroll*.23)*.006);
    // Pin the perimeter so the original image never exposes an empty edge.
    vec2 edge=smoothstep(vec2(0.),vec2(.09),vUv)*smoothstep(vec2(0.),vec2(.09),1.-vUv);
    vec2 displacement=(flow-push-wake+tide)/vec2(uAspect,1.)*edge.x*edge.y;
    // Same cover crop as object-fit:cover / object-position:center bottom.
    vec2 uv=(vUv+displacement)*uCover+vec2((1.-uCover.x)*.5,0.);
    vec3 color=texture2D(uPainting,clamp(uv,vec2(.001),vec2(.999))).rgb;
    gl_FragColor=vec4(color,1.);
    #include <colorspace_fragment>
  }`;

export async function createLiquid(host) {
  let renderer,texture,geometry,material,observer,resizeObserver;
  let disposed=false,paused=false,visible=true,focused=true,frame=0,last=0,lastPaint=0,elapsed=0;
  const events=new AbortController();
  const target=new Vector2(.5,.5),pointer=new Vector2(.5,.5),velocity=new Vector2();
  let strength=0,aimStrength=0;
  const mount=host.querySelector('.liquid-canvas');
  const interaction=window;
  let width=innerWidth,height=innerHeight,scroll=0;
  const fallback=()=>{host.dataset.artState='still';delete host.dataset.artPaused;};
  function dispose() {
    if(disposed)return;disposed=true;cancelAnimationFrame(frame);events.abort();observer?.disconnect();resizeObserver?.disconnect();
    geometry?.dispose();material?.dispose();texture?.dispose();renderer?.dispose();renderer?.domElement.remove();fallback();
  }
  try {
    renderer=new WebGLRenderer({alpha:false,antialias:false,powerPreference:'low-power'});
    renderer.setPixelRatio(Math.min(devicePixelRatio,innerWidth<760?1:1.25));
    renderer.outputColorSpace=SRGBColorSpace;
    renderer.domElement.setAttribute('aria-hidden','true');
    renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();dispose();host.dispatchEvent(new CustomEvent('culture:art-failed',{bubbles:true}));},{signal:events.signal});
    const image=host.querySelector('picture img');
    texture=await new TextureLoader().loadAsync(host.dataset.liquidTexture||image.currentSrc||image.src);
    if(disposed){texture.dispose();return null;}
    texture.colorSpace=SRGBColorSpace;texture.minFilter=LinearFilter;texture.magFilter=LinearFilter;texture.generateMipmaps=false;
    const uniforms={uPainting:{value:texture},uCover:{value:new Vector2(1,1)},uPointer:{value:pointer},uVelocity:{value:velocity},uTime:{value:0},uAspect:{value:1},uStrength:{value:0},uScroll:{value:0}};
    geometry=new PlaneGeometry(2,2);
    material=new ShaderMaterial({vertexShader:vertex,fragmentShader:fragment,uniforms,depthTest:false,depthWrite:false});
    const scene=new Scene();scene.add(new Mesh(geometry,material));
    const camera=new OrthographicCamera(-1,1,1,-1,0,1);
    let shaderFailed=false;
    renderer.debug.onShaderError=()=>{shaderFailed=true;};
    function resize() {
      if(disposed)return;
      width=host.clientWidth;height=host.clientHeight;
      if(!width||!height)return;
      renderer.setSize(width,height,false);
      const ratio=width/height,imageRatio=texture.image.width/texture.image.height;
      if(host.dataset.liquidFit==='fill') uniforms.uCover.value.set(1,1);
      else uniforms.uCover.value.set(Math.min(1,ratio/imageRatio),Math.min(1,imageRatio/ratio));
      uniforms.uAspect.value=ratio;
    }
    function allowed(){return !disposed&&!paused&&visible&&focused&&!document.hidden;}
    function render(now) {
      frame=0;
      if(!allowed()){last=0;return;}
      // The background's slow pigment movement needs only thirty paints/second.
      if(now-lastPaint<32){frame=requestAnimationFrame(render);return;}
      lastPaint=now;
      const delta=last?Math.min((now-last)/1000,.05):1/60;last=now;elapsed+=delta;
      const ease=1-Math.exp(-delta*7);
      velocity.set(target.x-pointer.x,target.y-pointer.y);
      pointer.lerp(target,ease);strength+=(aimStrength-strength)*ease;
      scroll+=(window.scrollY/Math.max(height,1)-scroll)*ease;
      uniforms.uTime.value=elapsed;uniforms.uStrength.value=strength;uniforms.uScroll.value=scroll;
      renderer.render(scene,camera);
      if(shaderFailed){dispose();host.dispatchEvent(new CustomEvent('culture:art-failed',{bubbles:true}));return;}
      host.dataset.artState='moving';
      frame=requestAnimationFrame(render);
    }
    function sync(){if(!allowed()){cancelAnimationFrame(frame);frame=0;last=0;}else if(!frame)frame=requestAnimationFrame(render);}
    mount.append(renderer.domElement);resize();
    resizeObserver=new ResizeObserver(resize);resizeObserver.observe(host);
    if('IntersectionObserver' in window){observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;sync();},{rootMargin:'80px'});observer.observe(host);}
    const pointTo=event=>{
      target.set(Math.max(0,Math.min(1,event.clientX/width)),Math.max(0,Math.min(1,1-event.clientY/height)));aimStrength=1;
    };
    // Window input keeps the liquid responsive behind every section; passive
    // touch handling leaves native scrolling and page controls in charge.
    interaction.addEventListener('pointermove',pointTo,{passive:true,signal:events.signal});
    interaction.addEventListener('pointerdown',pointTo,{passive:true,signal:events.signal});
    interaction.addEventListener('pointerup',event=>{if(event.pointerType==='touch')aimStrength=0;},{signal:events.signal});
    interaction.addEventListener('pointercancel',()=>{aimStrength=0;},{signal:events.signal});
    document.addEventListener('pointerleave',()=>{aimStrength=0;},{signal:events.signal});
    document.addEventListener('visibilitychange',sync,{signal:events.signal});
    window.addEventListener('blur',()=>{focused=false;aimStrength=0;sync();},{signal:events.signal});
    window.addEventListener('focus',()=>{focused=true;sync();},{signal:events.signal});
    sync();
    return {pause(value){paused=value;host.dataset.artPaused=String(value);sync();},dispose};
  } catch {dispose();return null;}
}
