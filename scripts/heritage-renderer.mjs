import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

export async function createHeritageScene(viewport, { modelURL, onFailure }) {
  const renderer = new THREE.WebGLRenderer({alpha: true, antialias: true, powerPreference: 'low-power'});
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, innerWidth < 768 ? 1.4 : 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-hidden', 'true');
  canvas.className = 'heritage-canvas';
  const world = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, .1, 40);
  camera.position.set(0, 2.95, 10.6);
  camera.lookAt(0, 2.55, 0);
  const ambient = new THREE.HemisphereLight(0xfff1d9, 0x673425, 1.35);
  world.add(ambient);
  const key = new THREE.DirectionalLight(0xffe6c5, 4.2);
  key.position.set(-3.6, 6.8, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, {left: -4, right: 4, top: 7, bottom: -2, near: .1, far: 18});
  key.shadow.normalBias = .025;
  key.shadow.bias = -.00025;
  key.shadow.radius = 4;
  world.add(key);
  const fill = new THREE.DirectionalLight(0xe4c5ad, .7);
  fill.position.set(4, 3, 4);
  world.add(fill);
  const rim = new THREE.DirectionalLight(0xffb779, 2.6);
  rim.position.set(2.5, 5, -3);
  world.add(rim);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.ShadowMaterial({color: 0x613522, opacity: .23, depthWrite: false}));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -.015;
  ground.receiveShadow = true;
  world.add(ground);
  let gltf;
  let resourcesReleased = false;
  function releaseResources() {
    if (resourcesReleased) return;
    resourcesReleased = true;
    const textures = new Set(), materials = new Set(), geometries = new Set();
    for (const root of [world, gltf?.scene]) {
      root?.traverse(node => {
        if (node.geometry) geometries.add(node.geometry);
        for (const material of (Array.isArray(node.material) ? node.material : [node.material])) {
          if (!material) continue;
          materials.add(material);
          Object.values(material).forEach(value => { if (value?.isTexture) textures.add(value); });
        }
      });
    }
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => material.dispose());
    textures.forEach(texture => texture.dispose());
    key.shadow.dispose();
    renderer.dispose();
    canvas.remove();
  }
  const loading = new THREE.LoadingManager();
  const draco = new DRACOLoader(loading);
  draco.setDecoderPath(new URL('draco/', import.meta.url).href);
  draco.setWorkerLimit(1);
  let decodeTimeout;
  try {
    const response = await fetch(modelURL, {signal: AbortSignal.timeout(18000)});
    if (!response.ok) throw new Error('Sculpture unavailable');
    const buffer = await response.arrayBuffer();
    gltf = await Promise.race([
      new GLTFLoader(loading).setDRACOLoader(draco).parseAsync(buffer, new URL('.', modelURL).href),
      new Promise((_, reject) => {
        decodeTimeout = setTimeout(() => {
          loading.abort();
          reject(new Error('Sculpture decoder timed out'));
        }, 18000);
      }),
    ]);
  } catch (error) { releaseResources(); throw error; }
  finally { clearTimeout(decodeTimeout); draco.dispose(); }
  const object = gltf.scene;
  // Bounds normalize a real Blender export without assuming its authoring units.
  const bounds = new THREE.Box3().setFromObject(object);
  const size = bounds.getSize(new THREE.Vector3());
  if (!Number.isFinite(size.y) || size.y <= 0) {
    releaseResources();
    throw new Error('Sculpture has no usable geometry');
  }
  const center = bounds.getCenter(new THREE.Vector3());
  const scale = 5.2 / size.y;
  object.scale.multiplyScalar(scale);
  object.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
  const turntable = new THREE.Group();
  turntable.add(object);
  world.add(turntable);
  object.traverse(node => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    materials.forEach(material => {
      material.metalness = 0;
      material.roughness = Math.max(.66, material.roughness || .8);
      material.transparent = false;
      material.opacity = 1;
    });
  });
  let active = false, disposed = false, failed = false, frame = 0, last = 0, elapsed = 0;
  let targetX = 0, targetY = 0, pointerX = 0, pointerY = 0, targetScroll = 0, scroll = 0, rect;
  let slowFrames = 0, measuredFrames = 0;
  function fail() {
    if (failed || disposed) return;
    failed = true;
    active = false;
    cancelAnimationFrame(frame);
    frame = 0;
    onFailure();
  }
  function renderFrame() {
    if (disposed || failed) return false;
    try {
      if (renderer.getContext().isContextLost()) { fail(); return false; }
      renderer.render(world, camera);
      return true;
    }
    catch (_) { fail(); return false; }
  }
  function pose(dt) {
    pointerX += (targetX - pointerX) * (1 - Math.exp(-dt * 3));
    pointerY += (targetY - pointerY) * (1 - Math.exp(-dt * 3));
    scroll += (targetScroll - scroll) * (1 - Math.exp(-dt * 3));
    // A bounded, slow arc reveals both cheeks; fixed light directions shade the moving surface.
    turntable.rotation.y = -.24 + Math.sin(elapsed * .16) * .5 + pointerX * .14 + scroll * .22;
    turntable.rotation.x = pointerY * .035;
    key.position.x = -3.6 + Math.sin(elapsed * .11) * .8 + pointerX * .65;
    camera.position.x = pointerX * .08;
    camera.lookAt(0, 2.55, 0);
  }
  function draw(now) {
    frame = 0;
    if (!active || disposed) return;
    const raw = last ? (now - last) / 1000 : 1 / 60;
    last = now;
    const dt = Math.min(raw, .05);
    elapsed += dt;
    pose(dt);
    if (!renderFrame()) return;
    // Reduce resolution before falling back on sustained slow rendering.
    if (++measuredFrames > 40 && raw > .075) slowFrames++;
    if (measuredFrames === 160 && slowFrames > 65) renderer.setPixelRatio(1);
    if (measuredFrames === 320 && slowFrames > 190) { fail(); return; }
    frame = requestAnimationFrame(draw);
  }
  function resize() {
    if (disposed || failed) return;
    rect = viewport.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    renderer.setSize(rect.width, rect.height);
    camera.aspect = rect.width / rect.height;
    // Portrait view keeps the full crown and plinth comfortably inside the frame.
    camera.position.z = camera.aspect < .8 ? 11.8 : 10.6;
    camera.updateProjectionMatrix();
    renderFrame();
  }
  const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
  if (resizeObserver) resizeObserver.observe(viewport);
  else window.addEventListener('resize', resize, {passive: true});
  const pointer = event => {
    if (event.pointerType !== 'mouse' || !active || !rect) return;
    targetX = Math.max(-1, Math.min(1, (event.clientX - rect.left) / rect.width * 2 - 1));
    // Use offsetY so scrolling cannot invalidate the cached viewport top.
    targetY = Math.max(-1, Math.min(1, event.offsetY / rect.height * 2 - 1));
  };
  const resetPointer = () => { targetX = targetY = 0; };
  viewport.addEventListener('pointermove', pointer, {passive: true});
  viewport.addEventListener('pointerleave', resetPointer);
  const scrollPose = event => { targetScroll = Math.max(-1, Math.min(1, Number(event.detail) || 0)); };
  viewport.addEventListener('alk:scene-progress', scrollPose);
  const contextLost = event => { event.preventDefault(); fail(); };
  canvas.addEventListener('webglcontextlost', contextLost);
  viewport.append(canvas);
  pose(1 / 60);
  resize();
  return {
    capture(type = 'image/webp', quality = .9) {
      // Synchronous render/read is used by the offline poster exporter only.
      if (!renderFrame()) throw new Error('Unable to render sculpture poster');
      return canvas.toDataURL(type, quality);
    },
    setActive(value) {
      if (disposed || failed || active === value) return;
      active = value;
      last = 0;
      if (active && !frame) frame = requestAnimationFrame(draw);
      else if (!active) { cancelAnimationFrame(frame); frame = 0; }
    },
    dispose() {
      if (disposed) return;
      disposed = true; active = false;
      cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', resize);
      viewport.removeEventListener('pointermove', pointer);
      viewport.removeEventListener('pointerleave', resetPointer);
      viewport.removeEventListener('alk:scene-progress', scrollPose);
      canvas.removeEventListener('webglcontextlost', contextLost);
      releaseResources();
    },
  };
}
