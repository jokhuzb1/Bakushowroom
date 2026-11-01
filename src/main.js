import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { WebGLPathTracer, DenoiseMaterial, GradientEquirectTexture } from 'three-gpu-pathtracer';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { buildContext } from './context.js';
import { unit } from './plan.js';
import { generateTextures, makeSky } from './textures.js';
import { createMaterials } from './materials.js';
import { buildUnit } from './builder.js';
import { furnish } from './furniture.js';
import { Walk } from './walk.js';
import { drawMinimap } from './minimap.js';
import './style.css';

const $ = (s) => document.querySelector(s);
const canvas = $('#view');
const loadBar = $('#load-bar'), loadText = $('#load-text');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
const dpr = Math.min(devicePixelRatio, 2);
renderer.setPixelRatio(dpr);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.NeutralToneMapping;
// the path tracer gets real occlusion, so interiors come out darker than the rasterizer:
// expose each for the interior, like an architectural photographer would
const EXPOSURE = { raster: 0.75, traced: 1.6, tracedInterior: 3.4 };
renderer.toneMappingExposure = EXPOSURE.raster;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.05, 400);

async function init() {
  const tex = await generateTextures((p, name) => {
    loadBar.style.width = `${Math.round(p * 85)}%`;
    if (name) loadText.textContent = `Generating materials · ${name}`;
  });
  loadText.textContent = 'Building the unit from the floor plan';
  await new Promise((r) => setTimeout(r, 0));

  // ---------- lighting ----------
  const sunDir = new THREE.Vector3(-0.5, 0.52, -0.69).normalize();
  const sky = makeSky(sunDir);
  scene.environment = sky;
  scene.background = sky;
  // dollhouse backdrop: soft studio gradient instead of the city
  const studio = new GradientEquirectTexture(256);
  studio.topColor.set(0x9a958b);
  studio.bottomColor.set(0x45423c);
  studio.exponent = 1.4;
  studio.update();
  scene.environmentIntensity = 1;

  const M = createMaterials(tex);
  const built = buildUnit(unit, M);
  const furn = furnish(M, unit);
  scene.add(built.root, furn.root);

  // the unit sits on floor 4: drop a ground plane far below so the view out reads as height
  const ground = new THREE.Mesh(new THREE.CircleGeometry(400, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x8f8b82, roughness: 1 }));
  ground.position.y = -unit.floorElevation;
  const context = buildContext(unit, built.center);
  scene.add(ground, context);
  const setSurroundings = (city) => {
    ground.visible = context.visible = city;
    scene.background = city ? sky : studio;
  };

  const c = built.center;
  const sun = new THREE.DirectionalLight(0xfff1dc, 4.5);
  sun.position.set(c.x + sunDir.x * 30, sunDir.y * 30, c.y + sunDir.z * 30);
  sun.target.position.set(c.x, 0, c.y);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  const sc = sun.shadow.camera;
  sc.left = -10; sc.right = 10; sc.top = 10; sc.bottom = -10; sc.near = 1; sc.far = 70;
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.02;
  sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  // rasterizer-only stand-in for light bouncing off the floor onto ceilings (the path tracer computes it for real)
  scene.add(new THREE.HemisphereLight(0xeef1f4, 0xf1e8dc, 0.9));

  // ---------- colliders ----------
  const colliders = [...built.colliders];
  scene.updateMatrixWorld(true);
  const b3 = new THREE.Box3();
  for (const s of furn.solids) {
    b3.setFromObject(s);
    if (b3.max.y > 0.3) colliders.push({ x0: b3.min.x, x1: b3.max.x, z0: b3.min.z, z1: b3.max.z });
  }
  const floors = [];
  built.root.traverse((o) => { if (o.userData.room) floors.push(o); });

  // ---------- post ----------
  const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(dpr);
  composer.setSize(innerWidth, innerHeight);
  composer.addPass(new RenderPass(scene, camera));
  const gtao = new GTAOPass(scene, camera, innerWidth, innerHeight);
  gtao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.2, thickness: 1.5, scale: 1.2 });
  gtao.blendIntensity = 1;
  composer.addPass(gtao);
  composer.addPass(new OutputPass());

  // ---------- path tracer ----------
  const pt = new WebGLPathTracer(renderer);
  pt.bounces = 3;
  pt.transmissiveBounces = 6;
  pt.filterGlossyFactor = 0.6;
  pt.minSamples = 2;
  pt.renderDelay = 0;
  pt.fadeDuration = 600;
  pt.tiles.set(2, 2);
  pt.renderScale = 0.7;
  pt.textureSize.set(1024, 1024);
  pt.rasterizeSceneCallback = () => {
    renderer.toneMappingExposure = EXPOSURE.raster;
    composer.render();
    renderer.toneMappingExposure = tracedExposure();
  };
  // edge-aware denoise that relaxes as samples accumulate
  const denoise = new FullScreenQuad(new DenoiseMaterial({ map: null, transparent: true, premultipliedAlpha: renderer.getContextAttributes().premultipliedAlpha }));
  pt.renderToCanvasCallback = (target, r, quad) => {
    const m = denoise.material, n = Math.max(1, pt.samples);
    m.map = target.texture;
    m.opacity = quad.material.opacity;
    m.sigma = 2.2; m.kSigma = 1.2; m.threshold = Math.max(0.02, 0.6 / Math.sqrt(n));
    const ac = r.autoClear;
    r.autoClear = false;
    denoise.render(r);
    r.autoClear = ac;
  };
  let ptReady = false, ptBuilding = null;
  const rebuildPathTracer = () => {
    ptReady = false;
    // BVH build runs on the main thread; defer a frame so the UI updates first
    const job = (ptBuilding = new Promise((r) => setTimeout(r, 60)).then(() => {
      if (job !== ptBuilding) return;
      // thin window glass would block the tracer's direct sky sampling and turn the interior into noise;
      // leave it out of the traced scene (its effect on a photo is a faint reflection at most)
      const glass = [];
      scene.traverse((o) => { if (o.isMesh && o.material === M.glass && o.visible) { glass.push(o); o.visible = false; } });
      pt.setScene(scene, camera);
      for (const o of glass) o.visible = true;
      ptReady = true;
    }));
    return job;
  };

  // ---------- controls ----------
  const orbit = new OrbitControls(camera, canvas);
  orbit.target.set(c.x, 0.4, c.y - 0.4);
  orbit.enableDamping = true;
  orbit.dampingFactor = 0.08;
  orbit.maxPolarAngle = THREE.MathUtils.degToRad(72);
  orbit.minDistance = 6;
  orbit.maxDistance = 30;
  // pull the overview camera back on portrait screens so the whole unit fits
  const dollOffset = new THREE.Vector3(4.5, 15.5, 9.5);
  const dollPose = { p: new THREE.Vector3(), t: orbit.target.clone() };
  const fitDoll = () => dollPose.p.copy(dollPose.t).add(dollOffset.clone().multiplyScalar(Math.max(1, 1.3 / camera.aspect)));
  fitDoll();
  camera.position.copy(dollPose.p);
  camera.lookAt(orbit.target);

  const walk = new Walk(camera, canvas, colliders, floors);
  // viewpoints: stand at (x, z), look toward (lx, lz)
  const view = (x, z, lx, lz, pitch = -0.06) => ({ x, z, yaw: Math.atan2(-(lx - x), -(lz - z)), pitch });
  const spawn = view(4.5, 7.4, 4.3, 3.0);

  // ---------- UI ----------
  const totalArea = unit.rooms.filter((r) => !r.outdoor).reduce((a, r) => a + (r.rect[2] - r.rect[0]) * (r.rect[3] - r.rect[1]), 0);
  $('#unit-name').textContent = unit.name;
  $('#unit-meta').textContent = `Floor ${unit.floor} · 2 bed · 1 bath · ${Math.round(totalArea)} m²`;
  const list = $('#rooms');
  const labelsEl = $('#labels');
  const roomViews = {
    living: view(5.5, 4.1, 1.5, 1.0),
    master: view(6.6, 3.6, 9.4, 1.2),
    bed2: view(6.9, 7.3, 9.5, 5.0),
    hall: spawn,
    bath: view(2.6, 5.9, 0.5, 7.2, -0.12),
    balcony: view(2.0, -0.35, 4.5, -1.6, 0),
  };
  const labelNodes = built.labels.map((l) => {
    const li = document.createElement('li');
    li.innerHTML = `<span>${l.name}</span><b>${l.area.toFixed(1)} m²</b>`;
    li.onclick = () => enterWalk(roomViews[l.id]);
    list.append(li);
    const tag = document.createElement('button');
    tag.className = 'tag';
    tag.innerHTML = `${l.name}<small>${l.area.toFixed(1)} m²</small>`;
    tag.onclick = () => enterWalk(roomViews[l.id]);
    labelsEl.append(tag);
    return { el: tag, pos: l.pos.clone().setY(0.9) };
  });

  let mode = 'doll';
  function tracedExposure() { return mode === 'walk' ? EXPOSURE.tracedInterior : EXPOSURE.traced; }
  let tween = null;
  const setModeUI = () => {
    document.body.dataset.mode = mode;
    $('#btn-doll').classList.toggle('on', mode === 'doll');
    $('#btn-walk').classList.toggle('on', mode === 'walk');
  };

  function animateTo(p, q, done) {
    tween = { p0: camera.position.clone(), q0: camera.quaternion.clone(), p1: p, q1: q, t: 0, done };
  }

  function enterWalk(v = spawn) {
    if (mode !== 'walk') {
      built.root.add(built.ceilings);
      setSurroundings(true);
      ptReady = false;
    }
    mode = 'walk';
    orbit.enabled = false;
    walk.enabled = false;
    setModeUI();
    camera.fov = 68; camera.updateProjectionMatrix();
    const pose = walk.poseFor(v.x, v.z, v.yaw, v.pitch ?? -0.05);
    animateTo(pose.p, pose.q, () => { walk.place(v.x, v.z, v.yaw, v.pitch ?? -0.05); walk.enabled = true; });
  }

  function enterDoll() {
    if (mode === 'doll') return;
    mode = 'doll';
    walk.enabled = false;
    built.ceilings.removeFromParent();
    setSurroundings(false);
    ptReady = false;
    setModeUI();
    camera.fov = 50; camera.updateProjectionMatrix();
    const m = new THREE.Matrix4().lookAt(dollPose.p, dollPose.t, new THREE.Vector3(0, 1, 0));
    animateTo(dollPose.p.clone(), new THREE.Quaternion().setFromRotationMatrix(m), () => {
      orbit.target.copy(dollPose.t);
      orbit.enabled = true;
      orbit.update();
    });
  }

  $('#btn-doll').onclick = () => { stopPhoto(); enterDoll(); };
  $('#btn-walk').onclick = () => { stopPhoto(); enterWalk(); };

  const status = $('#status');
  // "Render photo": freeze the view and let the path tracer converge, then show the still
  const PHOTO_SAMPLES = 160;
  let photo = null;
  const photoBtn = $('#btn-photo');
  async function startPhoto() {
    if (photo || tween) return;
    photo = { done: false };
    orbit.enabled = false;
    walk.enabled = false;
    document.body.dataset.rendering = '1';
    status.textContent = 'Preparing scene…';
    if (!ptReady) await rebuildPathTracer();
    if (!photo) return;
    pt.updateCamera();
    photo.started = performance.now();
  }
  function stopPhoto() {
    if (!photo) return;
    photo = null;
    delete document.body.dataset.rendering;
    if (mode === 'doll') orbit.enabled = true;
    else walk.enabled = true;
  }
  photoBtn.onclick = () => (photo ? stopPhoto() : startPhoto());
  canvas.addEventListener('pointerdown', () => { if (photo?.done || photo?.started) stopPhoto(); }, true);
  addEventListener('keydown', (e) => { if (photo && e.code !== 'KeyP') stopPhoto(); });
  $('#btn-shot').onclick = () => {
    const a = document.createElement('a');
    a.download = `${unit.id}-${Date.now()}.png`;
    a.href = canvas.toDataURL('image/png');
    a.click();
  };
  setModeUI();
  built.ceilings.removeFromParent();
  setSurroundings(false);
  loadBar.style.width = '100%';
  $('#loader').classList.add('done');

  // ---------- loop ----------
  const mini = $('#minimap');
  const clock = new THREE.Clock();
  const v = new THREE.Vector3();

  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05);
    if (tween) {
      tween.t = Math.min(1, tween.t + dt / 1.3);
      const e = tween.t < 0.5 ? 4 * tween.t ** 3 : 1 - (-2 * tween.t + 2) ** 3 / 2;
      camera.position.lerpVectors(tween.p0, tween.p1, e);
      camera.quaternion.slerpQuaternions(tween.q0, tween.q1, e);
      if (tween.t >= 1) { const d = tween.done; tween = null; d?.(); }
    } else if (mode === 'doll') orbit.update();
    walk.update(dt);
    camera.updateMatrixWorld();

    if (photo?.started && !photo.done) {
      renderer.toneMappingExposure = tracedExposure();
      pt.renderSample();
      renderer.toneMappingExposure = EXPOSURE.raster;
      const p = Math.min(1, pt.samples / PHOTO_SAMPLES);
      const secs = (performance.now() - photo.started) / 1000;
      const eta = p > 0.03 ? Math.max(0, Math.round(secs / p - secs)) : null;
      status.textContent = `Rendering photo · ${Math.round(p * 100)}%${eta !== null ? ` · ~${eta}s` : ''}`;
      status.style.setProperty('--p', p);
      status.className = 'pill live progress';
      if (p >= 1) {
        photo.done = true;
        status.textContent = 'Photo ready · save it, or click to keep exploring';
        status.className = 'pill done';
      }
    } else if (!photo) {
      composer.render();
      status.textContent = 'Real-time view';
      status.className = 'pill';
    }

    if (mode === 'doll' && !tween) {
      for (const n of labelNodes) {
        v.copy(n.pos).project(camera);
        n.el.style.transform = `translate(-50%, -50%) translate(${(v.x * 0.5 + 0.5) * innerWidth}px, ${(-v.y * 0.5 + 0.5) * innerHeight}px)`;
      }
    }
    if (mode === 'walk') drawMinimap(mini, unit, camera, walk);
    requestAnimationFrame(frame);
  }
  frame();

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    composer.setSize(innerWidth, innerHeight);
    fitDoll();
    pt.updateCamera();
  });

  window.__app = { scene, camera, renderer, pt, built, walk, enterWalk, enterDoll, sun, M, colliders, roomViews };
}

init().catch((e) => {
  console.error(e);
  loadText.textContent = `Error: ${e.message}`;
});
