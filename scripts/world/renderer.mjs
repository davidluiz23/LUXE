import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { chapters, clamp } from './spec.mjs';

export async function createWorld(viewport, { signal, onFailure, onActivate, onReady }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-hidden', 'true');
  canvas.className = 'world-canvas';
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#211e1a');
  scene.fog = new THREE.FogExp2('#211e1a', .017);
  const world = new THREE.Group(); world.name = 'world'; scene.add(world);
  const environment = new THREE.Group(); environment.name = 'stone-gallery'; world.add(environment);
  const landmarks = new THREE.Group(); landmarks.name = 'clay-study'; world.add(landmarks);
  const exhibits = new THREE.Group(); exhibits.name = 'clothing-exhibition'; world.add(exhibits);
  const camera = new THREE.PerspectiveCamera(35, 1, .1, 110);
  const target = new THREE.Vector3(), position = new THREE.Vector3();
  const aVector = new THREE.Vector3(), bVector = new THREE.Vector3();
  const key = new THREE.DirectionalLight('#fff0db', 2.8);
  key.position.set(-3.5, 8, 5); key.target.position.set(0, 2, -1);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, {left: -13, right: 9, top: 9, bottom: -5, near: .5, far: 32});
  key.shadow.normalBias = .025; key.shadow.bias = -.0002;
  key.shadow.radius = 4;
  const fill = new THREE.HemisphereLight('#eee5d6', '#473023', .65);
  const rim = new THREE.DirectionalLight('#eba977', 2.4); rim.position.set(4, 6, -5);
  const softbox = new THREE.DirectionalLight('#b9c4c8', .35); softbox.position.set(7, 5, 4);
  scene.add(key, key.target, fill, rim, softbox);

  const stone = new THREE.MeshStandardMaterial({color: '#423c35', roughness: .93, metalness: 0});
  // World-scale mineral variation in the architectural material, never a screen-space grain overlay.
  stone.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vStone;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvStone = (modelMatrix * vec4(position, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vStone;')
      .replace('#include <color_fragment>', '#include <color_fragment>\nfloat mineral = fract(sin(dot(floor(vStone * 160.0), vec3(12.9898,78.233,34.719))) * 43758.5453);\ndiffuseColor.rgb *= 0.96 + mineral * 0.075;');
  };
  const darkStone = new THREE.MeshStandardMaterial({color: '#342d26', roughness: .96});
  const plinthMaterial = new THREE.MeshStandardMaterial({color: '#5b5044', roughness: .87});
  function block(name, size, at, material = stone, bevel = .04) {
    const geometry = bevel ? new RoundedBoxGeometry(...size, 2, bevel) : new THREE.BoxGeometry(...size);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name; mesh.position.set(...at); mesh.castShadow = true; mesh.receiveShadow = true;
    environment.add(mesh); return mesh;
  }
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), stone);
  floor.name = 'continuous-floor'; floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; floor.position.y = -.025;
  environment.add(floor);
  block('back-wall', [44, 13, .4], [0, 6.5, -13], darkStone);
  block('gallery-left-return', [.45, 10, 12], [-17.1, 5, -7], darkStone);
  block('exhibition-wall', [8.1, 6.9, .4], [-11.8, 3.45, -5.35], stone);
  function arch(depth, index) {
    const shape = new THREE.Shape();
    shape.moveTo(-3.35, 0); shape.lineTo(-3.35, 4.25);
    shape.absarc(0, 4.25, 3.35, Math.PI, 0, true);
    shape.lineTo(3.35, 0); shape.lineTo(2.93, 0); shape.lineTo(2.93, 4.25);
    shape.absarc(0, 4.25, 2.93, 0, Math.PI, false);
    shape.lineTo(-2.93, 0); shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, {depth: .38, bevelEnabled: true, bevelSize: .035, bevelThickness: .035, bevelSegments: 2, steps: 1, curveSegments: 48});
    const mesh = new THREE.Mesh(geo, index ? darkStone : stone);
    mesh.position.set(2.1, 0, depth); mesh.name = `portal-${index}`; mesh.castShadow = mesh.receiveShadow = true;
    environment.add(mesh);
  }
  [-2.25, -6.1, -9.9].forEach(arch);
  block('plinth-foot', [2.6, .15, 2.4], [2.1, .075, .05], darkStone);
  block('plinth-shaft', [2.35, .69, 2.17], [2.1, .495, .05], plinthMaterial);
  block('plinth-cap', [2.43, .09, 2.25], [2.1, .885, .05], plinthMaterial, .02);
  block('photograph-mount', [5.05, 3.43, .16], [-11.8, 3.25, -4.96], darkStone, .025);
  const photographMaterial = new THREE.MeshBasicMaterial({color: '#dedbd6', toneMapped: false});
  const photograph = new THREE.Mesh(new THREE.PlaneGeometry(4.85, 4.85 / (1280 / 854)), photographMaterial);
  photograph.name = 'original-product-photograph'; photograph.position.set(-11.8, 3.25, -4.78); exhibits.add(photograph);
  block('exhibition-ledge', [5.35, .1, .38], [-11.8, 1.49, -4.9], plinthMaterial, .02);

  let disposed = false, failed = false, frame = 0, last = 0, active = false;
  let exact = 0, smooth = 0, inputX = 0, inputY = 0, pointerX = 0, pointerY = 0;
  let inspectTarget = 0, inspect = 0, focused = false, mobile = false, quality = 1.5, renderCount = 0;
  let sampleCount = 0, sampleTotal = 0, frameTime = 0, width = 0, height = 0, previousShadow = '';
  const textures = new Set(), auxiliaryRoots = [], abort = new AbortController();
  const textureCache = new Map();
  const cleanupCallbacks = [];
  function dispose() {
    if (disposed) return;
    disposed = true; active = false; abort.abort(); cancelAnimationFrame(frame); frame = 0;
    cleanupCallbacks.forEach(fn => fn());
    const materials = new Set(), geometries = new Set();
    for (const root of [scene, ...auxiliaryRoots]) root.traverse(node => {
      if (node.geometry) geometries.add(node.geometry);
      for (const material of (Array.isArray(node.material) ? node.material : [node.material])) {
        if (!material) continue; materials.add(material);
        Object.values(material).forEach(value => { if (value?.isTexture) textures.add(value); });
      }
    });
    geometries.forEach(geo => geo.dispose()); materials.forEach(mat => mat.dispose()); textures.forEach(tex => tex.dispose());
    key.shadow.dispose(); renderer.dispose(); canvas.remove();
  }
  const stopOnAbort = () => dispose();
  signal.addEventListener('abort', stopOnAbort, {once: true});
  cleanupCallbacks.push(() => signal.removeEventListener('abort', stopOnAbort));
  function fail(error) {
    if (failed || disposed) return;
    failed = true; dispose(); onFailure(error);
  }
  const draco = new DRACOLoader();
  draco.setDecoderPath(new URL('../heritage/draco/', import.meta.url).href); draco.setWorkerLimit(1);
  const loadModel = async () => {
    const response = await fetch(new URL('../../assets/heritage/terracotta-study.glb', import.meta.url), {signal: AbortSignal.any([abort.signal, AbortSignal.timeout(20000)])});
    if (!response.ok) throw new Error('The sculpture could not be loaded.');
    const gltf = await new GLTFLoader().setDRACOLoader(draco).parseAsync(await response.arrayBuffer(), '');
    if (disposed) {
      gltf.scene.traverse(node => { node.geometry?.dispose(); if(node.material) { for(const value of Object.values(node.material)) if(value?.isTexture) value.dispose(); node.material.dispose(); } });
      throw new DOMException('World disposed', 'AbortError');
    }
    const object = gltf.scene;
    const bounds = new THREE.Box3().setFromObject(object), size = bounds.getSize(aVector), center = bounds.getCenter(bVector);
    if (!Number.isFinite(size.y) || size.y <= 0) throw new Error('Invalid sculpture bounds');
    const scale = 4.6 / size.y;
    object.scale.multiplyScalar(scale); object.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
    const sculpture = new THREE.Group(); sculpture.name = 'terracotta'; sculpture.position.set(2.1, .93, .05); sculpture.rotation.y = -.16; sculpture.add(object); landmarks.add(sculpture);
    object.traverse(node => {
      if (!node.isMesh) return;
      node.castShadow = node.receiveShadow = true;
      for (const material of (Array.isArray(node.material) ? node.material : [node.material])) { material.metalness = 0; material.roughness = Math.max(.78, material.roughness); }
    });
    renderer.shadowMap.needsUpdate = true;
  };
  async function preparePhoto(url) {
    const absolute = new URL(url, document.baseURI).href;
    if (!textureCache.has(absolute)) {
      const promise = new THREE.TextureLoader().loadAsync(absolute).then(texture => {
        if (disposed) { texture.dispose(); throw new DOMException('World disposed', 'AbortError'); }
        texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
        textures.add(texture); return texture;
      }).catch(error => {textureCache.delete(absolute); throw error;});
      textureCache.set(absolute, promise);
    }
    return textureCache.get(absolute);
  }
  let photoRequest = 0;
  async function setPhoto(url) {
    const request = ++photoRequest;
    const texture = await preparePhoto(url);
    if (disposed || request !== photoRequest) return;
    photographMaterial.map = texture; photographMaterial.color.set('#ffffff'); photographMaterial.needsUpdate = true;
    // Fit actual photograph proportions; never stretch a published replacement.
    const aspect = texture.image.width / texture.image.height;
    photograph.scale.set(Math.min(1, aspect / 1.499), Math.min(1, 1.499 / aspect), 1);
    schedule();
  }
  const raycaster = new THREE.Raycaster(), rayPoint = new THREE.Vector2(5, 5);
  const proxyMaterial = new THREE.MeshBasicMaterial({visible: false});
  const sculptureProxy = new THREE.Mesh(new THREE.BoxGeometry(2.2, 4.6, 1.8), proxyMaterial);
  sculptureProxy.position.set(2.1, 3.23, .05); sculptureProxy.name = 'inspect';
  const photoProxy = new THREE.Mesh(new THREE.PlaneGeometry(4.85, 3.23), proxyMaterial);
  photoProxy.position.copy(photograph.position); photoProxy.name = 'artwork';
  scene.add(sculptureProxy, photoProxy);
  let hover = '', rayDirty = false;
  const proxies = [sculptureProxy, photoProxy];
  const available = name => name === 'inspect' ? exact >= .65 && exact <= 1.35 : exact >= 1.65 && exact <= 2.35;
  function testPointer() {
    raycaster.setFromCamera(rayPoint, camera);
    const hits = raycaster.intersectObjects(proxies, false);
    const next = hits.find(hit => available(hit.object.name))?.object.name || '';
    if (next !== hover) { hover = next; viewport.dataset.hover = hover; }
    rayDirty = false;
  }
  function pose(dt, immediate = false) {
    const blend = immediate ? 1 : 1 - Math.exp(-6.5 * dt);
    smooth += (exact - smooth) * blend;
    pointerX += (inputX - pointerX) * blend; pointerY += (inputY - pointerY) * blend;
    inspect += (inspectTarget - inspect) * (immediate ? 1 : 1 - Math.exp(-8 * dt));
    const i = Math.min(chapters.length - 2, Math.floor(smooth)), t = clamp(smooth - i);
    const first = chapters[i], second = chapters[i + 1];
    const ca = mobile ? first.mobile : width <= 1000 ? first.tablet : first.camera, cb = mobile ? second.mobile : width <= 1000 ? second.tablet : second.camera;
    position.fromArray(ca.p).lerp(bVector.fromArray(cb.p), t);
    target.fromArray(ca.t).lerp(aVector.fromArray(cb.t), t);
    camera.position.copy(position); camera.position.x += pointerX * .065; camera.position.y += pointerY * .035;
    camera.lookAt(target); camera.fov = THREE.MathUtils.lerp(ca.fov, cb.fov, t); camera.updateProjectionMatrix();
    const value = name => THREE.MathUtils.lerp(first.light[name], second.light[name], t);
    const inForm = 1 - clamp(Math.abs(smooth - 1) * 2);
    key.intensity = value('key') + inspect * inForm * .9;
    key.position.x = value('x') - inspect * inForm * 3.6 + pointerX * .24;
    key.position.z = value('z') - inspect * inForm * 2.8;
    fill.intensity = value('fill') * (1 - inspect * inForm * .42);
    rim.intensity = value('rim') + (focused || hover === 'inspect' ? .25 : 0);
    scene.fog.density = value('fog');
    const shadowState = `${key.position.x.toFixed(2)},${key.position.z.toFixed(2)}`;
    if (previousShadow !== shadowState) { renderer.shadowMap.needsUpdate = true; previousShadow = shadowState; }
  }
  function render() {
    if (disposed) return;
    if (renderer.getContext().isContextLost()) { fail(new Error('WebGL context lost')); return; }
    renderer.render(scene, camera); renderCount++;
  }
  function draw(now) {
    frame = 0;
    if (!active || disposed || document.hidden) return;
    const elapsed = last ? now - last : 16.7; last = now;
    const start = performance.now();
    pose(Math.min(elapsed / 1000, 1 / 30));
    if (rayDirty) testPointer();
    try { render(); } catch (error) { fail(error); return; }
    frameTime = performance.now() - start;
    if (renderCount > 25 && elapsed < 250) {
      sampleTotal += elapsed; sampleCount++;
      if (sampleCount === 120) {
        if (sampleTotal / sampleCount > 25 && quality > 1) { quality = 1; renderer.setPixelRatio(1); renderer.setSize(width, height); }
        sampleCount = sampleTotal = 0;
      }
    }
    if (Math.abs(exact - smooth) > .00005 || Math.abs(inputX - pointerX) + Math.abs(inputY - pointerY) > .001 || Math.abs(inspectTarget - inspect) > .001) schedule();
    else last = 0;
  }
  function schedule() { if (!frame && active && !disposed && !document.hidden) frame = requestAnimationFrame(draw); }
  function resize() {
    if (disposed) return;
    const rect = viewport.getBoundingClientRect(); width = rect.width; height = rect.height;
    mobile = width <= 700;
    quality = Math.min(quality, mobile ? 1.25 : 1.5, devicePixelRatio || 1);
    renderer.setPixelRatio(quality); renderer.setSize(width, height); camera.aspect = width / Math.max(1, height);
    pose(0, true); schedule();
  }
  const observer = new ResizeObserver(resize); observer.observe(viewport);
  cleanupCallbacks.push(() => observer.disconnect());
  const lost = event => { event.preventDefault(); fail(new Error('WebGL context lost')); };
  canvas.addEventListener('webglcontextlost', lost); cleanupCallbacks.push(() => canvas.removeEventListener('webglcontextlost', lost));
  const abortDecode = () => draco.dispose();
  abort.signal.addEventListener('abort', abortDecode, {once: true});
  try {
    await loadModel();
    if (signal.aborted || disposed) throw new DOMException('World disposed', 'AbortError');
    await setPhoto('assets/products/ijele.jpg').catch(() => {});
    viewport.append(canvas); resize();
    await renderer.compileAsync(scene, camera);
    if (signal.aborted || disposed) throw new DOMException('World disposed', 'AbortError');
    pose(0, true); render(); onReady();
  } catch (error) { dispose(); throw error; }
  finally { draco.dispose(); abort.signal.removeEventListener('abort', abortDecode); }

  return {
    setProgress(value, immediate = false) { exact = clamp(value, 0, 3); if (!available('inspect')) inspectTarget = 0; rayDirty = true; if (immediate) pose(0, true); schedule(); },
    setActive(value) { active = value; last = 0; if (value) schedule(); else { cancelAnimationFrame(frame); frame = 0; inputX = inputY = 0; hover = ''; } },
    pointer(x, y) { inputX = clamp(x, -1, 1); inputY = clamp(-y, -1, 1); rayPoint.set(x, -y); rayDirty = true; schedule(); },
    resetPointer() { inputX = inputY = 0; rayPoint.set(5, 5); hover = ''; rayDirty = true; schedule(); },
    activate(x, y) { rayPoint.set(x, -y); testPointer(); if (hover) onActivate(hover); },
    setInspect(value) { inspectTarget = value ? 1 : 0; schedule(); },
    setFocused(value) { focused = value; schedule(); },
    setPhoto,
    capture() { pose(0, true); render(); return canvas.toDataURL('image/webp', .9); },
    stats() { return {exact, smooth, camera: camera.position.toArray(), target: target.toArray(), fov: camera.fov, dpr: renderer.getPixelRatio(), calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, textures: renderer.info.memory.textures, geometries: renderer.info.memory.geometries, programs: renderer.info.programs.length, cpuRenderMs: frameTime, frames: renderCount, active, settled: !frame, disposed, photo: {url: photographMaterial.map?.image?.src, color: photographMaterial.color.getHexString(), size: [photographMaterial.map?.image?.width, photographMaterial.map?.image?.height]}}; },
    dispose,
  };
}
