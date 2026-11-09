import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SSAARenderPass } from 'three/addons/postprocessing/SSAARenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { WebGLPathTracer, DenoiseMaterial } from 'three-gpu-pathtracer';
import { ParallelMeshBVHWorker } from 'three-mesh-bvh/worker';
import { makeSky } from '../textures.js';
import { Atmosphere } from './atmosphere.js';
import { Showcase } from './showcase.js';
import { buildingMaterials } from './materials.js';
import { buildBuilding, CX, CY } from './model.js';
import { buildSite, STREET_VIEWS } from './site.js';
import { buildComplex } from './complex.js';
import { Walk } from '../walk.js';
import { furnishUnit, furnishCommon } from './interior.js';
import { buildShowflat } from './showflat.js';
import { buildBranch, loadBranchModels, BRANCH } from './branch.js';
import { loadInteriorKit } from './kit.js';
import { UnitPlan } from './unitplan.js';
import { NavAids, nameOf } from './navaids.js';
import { PanoViewer } from '../pano/viewer.js';
import { panoId, hasPano } from '../pano/units.js';
import './building.css';

const $ = (s) => document.querySelector(s);
const canvas = $('#view');
const loadText = $('#load-text'), loadBar = $('#load-bar');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
const dpr = Math.min(devicePixelRatio, 2);
renderer.setPixelRatio(dpr);
renderer.setSize(innerWidth, innerHeight);
// outdoor look: AgX (filmic, photographic highlight roll-off) with little flat fill, so the sun and the
// ambient occlusion give the facades their depth
const OUTDOOR = { toneMapping: THREE.AgXToneMapping, exposure: 0.85, env: 0.45, hemi: 0.25, sun: 5 };
renderer.toneMapping = OUTDOOR.toneMapping;
renderer.toneMappingExposure = OUTDOOR.exposure;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.localClippingEnabled = true;
// dollhouse cut: everything of 3A above this plane is hidden while a floor is open
const cut = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e6);
// room box: while a room is being viewed, everything of the building outside it is hidden (neighbouring
// rooms, other floors). Planes are always present (parked far away when unused) so materials never recompile.
const roomClip = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]].map((n) => new THREE.Plane(new THREE.Vector3(...n), 1e6));
const clipPlanes = [cut, ...roomClip];
// clipShadows: what the cut hides must not shade the open floor either (blotchy ceiling shadows otherwise).
// Every interior passes through here, so its textures also get full anisotropic filtering: floors and walls
// seen at a grazing angle stay sharp instead of smearing.
const MAX_ANISO = renderer.capabilities.getMaxAnisotropy();
const TEX_KEYS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap'];
const sharpen = (m) => { for (const k of TEX_KEYS) if (m[k] && m[k].anisotropy < MAX_ANISO) { m[k].anisotropy = MAX_ANISO; m[k].needsUpdate = true; } };
const clipMaterials = (root) => root.traverse((o) => { if (o.material && !o.material.isLineBasicMaterial) { Object.assign(o.material, { clippingPlanes: clipPlanes, clipShadows: true }); sharpen(o.material); } });

const scene = new THREE.Scene();
// a page loaded in a hidden window has no size yet: 0 / 0 would poison the camera (and every plane clipped through it) with NaN
const camera = new THREE.PerspectiveCamera(40, innerWidth && innerHeight ? innerWidth / innerHeight : 16 / 9, 0.1, 2000);

const STATUS = {
  available: { label: 'Available', color: 0x3fb68b },
};

const T = {}; // load-stage timings (ms), read by __b.perf
let tMark = performance.now();
const mark = (k) => { const n = performance.now(); T[k] = Math.round(n - tMark); tMark = n; };

async function init() {
  loadText.textContent = 'Reading floor plans';
  const data = await (await fetch('/data/building.json')).json();
  mark('fetchPlan');
  loadBar.style.width = '30%';
  await new Promise((r) => setTimeout(r, 0));

  // light: late-afternoon sun from the north-west so the street facade is lit, as in the render
  const sunDir = new THREE.Vector3(-0.6, 0.55, -0.6).normalize();
  // a deeper blue than the default: AgX greys out pale skies
  const sky = makeSky(sunDir, 1024, 512, { zenith: [0.12, 0.3, 0.85], horizon: [0.62, 0.76, 0.95] });
  mark('sky');
  scene.environment = sky;
  scene.background = sky;
  const sun = new THREE.DirectionalLight(0xffe6c7, OUTDOOR.sun);
  sun.position.copy(sunDir).multiplyScalar(160).add(new THREE.Vector3(23, 0, 40));
  sun.target.position.set(23, 0, 40);
  scene.add(sun.target);
  sun.castShadow = true;
  // 4096: about 4 cm per shadow texel over the whole plot, so balcony and cornice shadows stay crisp
  sun.shadow.mapSize.set(4096, 4096);
  Object.assign(sun.shadow.camera, { left: -90, right: 90, top: 90, bottom: -90, near: 10, far: 400 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  const hemi = new THREE.HemisphereLight(0xf3efe8, 0xd8c5ab, OUTDOOR.hemi);
  scene.environmentIntensity = OUTDOOR.env;
  sun.shadow.radius = 4;
  // crisp shadows close up: the sun's shadow box shrinks to the apartment being viewed
  const SHADOW_WIDE = { left: -90, right: 90, top: 90, bottom: -90 };
  let shadowAt = null;
  const shadowFocus = (c = shadowAt) => { // (no argument: the sun moved, same focus)
    shadowAt = c;
    const box = c ? { left: -14, right: 14, top: 14, bottom: -14 } : SHADOW_WIDE;
    Object.assign(sun.shadow.camera, box);
    sun.shadow.camera.updateProjectionMatrix();
    const at = c ?? new THREE.Vector3(23, 0, 40);
    sun.target.position.copy(at);
    sun.position.copy(sunDir).multiplyScalar(c ? 60 : 160).add(at);
    sun.target.updateMatrixWorld();
  };
  scene.add(sun, hemi);

  loadText.textContent = 'Generating 16 floors';
  await new Promise((r) => setTimeout(r, 0));
  const M = buildingMaterials();
  const B = buildBuilding(data, M);
  mark('building');
  const site = buildSite(), complex = buildComplex();
  mark('siteComplex');
  scene.add(B.root, site, complex);
  for (const r of [site, complex]) r.traverse((o) => { if (o.material && !Array.isArray(o.material)) sharpen(o.material); });
  clipMaterials(B.root);
  loadBar.style.width = '85%';

  // apartment overlays per floor (hidden until a floor is opened)
  const unitMeshes = [];
  // the selected flat is marked by its outline: a tint over the whole floor greys its materials
  const BASE = 0.0, HOVER = 0.16, SELECTED = 0.0;
  for (const f of B.floors) {
    const og = new THREE.Group();
    og.visible = false;
    for (const u of f.units) {
      u.status = 'available';
      const mat = new THREE.MeshBasicMaterial({ color: STATUS[u.status].color, transparent: true, opacity: BASE, depthWrite: false });
      const line = new THREE.LineBasicMaterial({ color: STATUS[u.status].color });
      for (const r of u.rects) {
        // picking plate at ceiling height so furniture never hides it; tint shows on hover
        const plate = new THREE.PlaneGeometry(r[2] - r[0] - 0.06, r[3] - r[1] - 0.06).rotateX(-Math.PI / 2);
        const m = new THREE.Mesh(plate, mat);
        m.position.set((r[0] + r[2]) / 2 - CX, f.z + 0.04, (r[1] + r[3]) / 2 - CY);
        m.userData.unit = u;
        m.renderOrder = 2;
        og.add(m);
        unitMeshes.push(m);
      }
      // outline of the flat on the floor
      const pts = [];
      for (const r of u.rects) {
        const [a, b, c, d] = [r[0] - CX + 0.05, r[1] - CY + 0.05, r[2] - CX - 0.05, r[3] - CY - 0.05];
        pts.push(a, 0, b, c, 0, b, c, 0, b, c, 0, d, c, 0, d, a, 0, d, a, 0, d, a, 0, b);
      }
      const lg = new THREE.BufferGeometry();
      lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      const ls = new THREE.LineSegments(lg, line);
      ls.position.y = f.z + 0.05;
      og.add(ls);
      u.material = mat;
    }
    f.overlay = og;
    B.root.add(og);
  }

  // hovered-floor highlight band
  const band = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffb259, transparent: true, opacity: 0.22, depthWrite: false }));
  band.visible = false;
  band.renderOrder = 3;
  scene.add(band);
  const bandEdges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: 0xffc27a }));
  band.add(bandEdges);

  // post
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }));
  composer.setPixelRatio(dpr);
  composer.setSize(innerWidth, innerHeight);
  // moving frames: one plain render. The settled frame (drawn once when the camera stops) is supersampled
  // instead: 4 sub-pixel-jittered renders averaged, on top of MSAA, so thin railings, window bars, text and
  // texture detail come out clean, at native-resolution memory cost
  const renderPass = new RenderPass(scene, camera);
  const ssaaPass = new SSAARenderPass(scene, camera);
  ssaaPass.sampleLevel = 2;
  ssaaPass.enabled = false;
  const setStill = (on) => { renderPass.enabled = !on; ssaaPass.enabled = on; gtao.enabled = on; };
  composer.addPass(renderPass);
  composer.addPass(ssaaPass);
  const gtao = new GTAOPass(scene, camera, innerWidth, innerHeight);
  // it hides points and lines from its normals pass, but not sprites: the sun and the lamp glows came out as black blocks
  { const hide = gtao._overrideVisibility.bind(gtao); gtao._overrideVisibility = () => { hide(); scene.traverseVisible((o) => { if (o.isSprite) gtao._visibilityCache.push(o); }); for (const o of gtao._visibilityCache) o.visible = false; }; }
  // AO is soft, low-frequency shading: compute it at half resolution (about a quarter of the cost)
  { const setSize = gtao.setSize.bind(gtao); gtao.setSize = (w, h) => setSize(Math.max(1, w / 2), Math.max(1, h / 2)); gtao.setSize(innerWidth * dpr, innerHeight * dpr); }
  gtao.updateGtaoMaterial({ radius: 0.8, distanceExponent: 1.4, thickness: 2, scale: 1 });
  composer.addPass(gtao);
  composer.addPass(new OutputPass());

  // photo-real stills in the walk-through: moving frames stay rasterized; once the camera rests, a path tracer
  // takes over and the still converges to a render (bounced light, soft shadows, reflections), fading in over
  // the real-time frame. Any movement hands back to the rasterizer at once. The traced scene is built per
  // show-flat on the first rest inside it (BVH in a worker).
  // samples: when the still counts as converged; meter: samples after which its exposure is set (before the
  // fade-in at minSamples)
  // Opt-in (?trace) until the traced image is reliable: on the Intel test GPU the full show-flat scene still
  // traces black even within the limits below.
  const TRACE = { enabled: new URLSearchParams(location.search).has('trace'), samples: 256, meter: 6, exposure: 3 };
  const pt = new WebGLPathTracer(renderer);
  pt.setBVHWorker(new ParallelMeshBVHWorker());
  Object.assign(pt, { bounces: 4, transmissiveBounces: 4, filterGlossyFactor: 0.5, minSamples: 8, renderDelay: 0, fadeDuration: 600, renderScale: 0.75 });
  pt.rasterizeScene = false; // the canvas still holds the settled raster frame to fade from
  pt.tiles.set(2, 2);
  pt.textureSize.set(1024, 1024);
  // edge-aware denoise that relaxes as samples accumulate
  const denoise = new FullScreenQuad(new DenoiseMaterial({ map: null, transparent: true, premultipliedAlpha: renderer.getContextAttributes().premultipliedAlpha }));
  pt.renderToCanvasCallback = (target, r, quad) => {
    const m = denoise.material, n = Math.max(1, pt.samples);
    m.map = target.texture;
    m.opacity = quad.material.opacity;
    m.blending = quad.material.blending;
    m.sigma = 2.2; m.kSigma = 1.2; m.threshold = Math.max(0.02, 0.6 / Math.sqrt(n));
    const ac = r.autoClear;
    r.autoClear = false;
    denoise.render(r);
    r.autoClear = ac;
  };
  const trace = { key: null, built: false, want: false, on: false, metered: false, rasterMid: 0 };
  // Traced stand-ins for the real-time materials. A MeshPhysicalMaterial in the traced scene blanked the whole
  // image in testing (this tracer + three.js release, Intel GPU), so materials are traced as standard ones,
  // stripped of maps by level to keep the texture array small: 1 = no roughness/metalness maps, 2 = no normal
  // map either, 3 = colour only (everything outside the flat, which is only seen through the windows).
  const MAX_TEXTURES = 60;
  const MAPS = [[], ['roughnessMap', 'metalnessMap', 'aoMap'], ['normalMap'], ['map', 'emissiveMap', 'alphaMap']];
  const standIns = new WeakMap();
  const standIn = (m, level) => {
    if (!m.isMeshPhysicalMaterial && level === 0) return m;
    if (!standIns.has(m)) standIns.set(m, []);
    const cache = standIns.get(m);
    if (!cache[level]) {
      const s = m.isMeshStandardMaterial ? new THREE.MeshStandardMaterial().copy(m) : m.clone();
      for (const k of MAPS.slice(1, level + 1).flat()) if (k in s) s[k] = null;
      cache[level] = s;
    }
    return cache[level];
  };
  const texturesOf = (mats) => {
    const set = new Set();
    for (const m of mats) for (const k of MAPS.flat()) if (m[k]) set.add(m[k].source ?? m[k]);
    return set.size;
  };
  function buildTrace(key) {
    trace.key = key;
    trace.built = false;
    // see-through panes (window glass, shower screens, lamp glass) would block the tracer's sky and lamp
    // sampling, and their effect on a photo is a faint reflection at most; the walk markers are UI.
    // Geometry is gathered synchronously, so all of this only lasts for this call.
    const hide = [aids.group, aids.exits, aids.cursor, band].filter((o) => o.visible);
    const near = [], far = [];
    scene.traverseVisible((o) => {
      if (!o.isMesh || Array.isArray(o.material)) return;
      const m = o.material;
      if (m === M.glass || (m.transparent && m.opacity < 0.5)) hide.push(o);
      else {
        let p = o;
        while (p && p !== key.group) p = p.parent;
        (p ? near : far).push(o);
      }
    });
    let level = 0;
    while (level < 3 && texturesOf(near.map((o) => standIn(o.material, level))) > MAX_TEXTURES) level++;
    const swapped = [];
    for (const [list, l] of [[near, level], [far, 3]]) {
      for (const o of list) {
        const s = standIn(o.material, l);
        if (s !== o.material) { swapped.push([o, o.material]); o.material = s; }
      }
    }
    for (const o of hide) o.visible = false;
    const job = pt.setSceneAsync(scene, camera);
    for (const o of hide) o.visible = true;
    for (const [o, m] of swapped) o.material = m;
    job.then(() => { if (trace.key === key) trace.built = true; }, (e) => console.warn('path tracer', e));
  }
  // median luminance of a sparse pixel sample (linear light)
  const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  function median(px, decode, stride) {
    const v = [];
    for (let i = 0; i < px.length; i += 4 * stride) {
      const [r, g, b] = decode ? [lin(px[i] / 255), lin(px[i + 1] / 255), lin(px[i + 2] / 255)] : [px[i], px[i + 1], px[i + 2]];
      v.push(0.2126 * r + 0.7152 * g + 0.0722 * b);
    }
    v.sort((a, b) => a - b);
    return v[v.length >> 1] ?? 0;
  }
  function stopTrace() { trace.want = trace.on = false; }
  // called on every settled walk frame, right after the raster frame is drawn: tracing starts as soon as the
  // scene for this flat is ready
  function wantTrace() {
    if (!TRACE.enabled || mode !== 'walk' || !walkCtx?.sf) return;
    if (trace.key !== walkCtx.sf) buildTrace(walkCtx.sf);
    const gl = renderer.getContext(), w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    trace.rasterMid = median(px, true, 37);
    trace.want = true;
  }
  function traceStep() {
    if (trace.want && !trace.on && trace.built) {
      pt.updateLights();
      pt.updateCamera();
      trace.on = true;
      trace.metered = false;
    }
    if (!trace.on) return;
    // real light transport has none of the rasterizer's fill light, so a traced interior comes out several
    // times darker: like a photographer, expose each still to match the real-time frame's mid-tones
    if (!trace.metered && pt.samples >= TRACE.meter) {
      const t = pt.target, px = new Float32Array(t.width * t.height * 4);
      renderer.readRenderTargetPixels(t, 0, 0, t.width, t.height, px);
      const mid = median(px, false, 37);
      if (mid > 0 && trace.rasterMid > 0) TRACE.exposure = THREE.MathUtils.clamp(trace.rasterMid / mid, 0.6, 12);
      trace.metered = true;
    }
    const exposure = renderer.toneMappingExposure;
    renderer.toneMappingExposure = TRACE.exposure;
    pt.renderSample();
    renderer.toneMappingExposure = exposure;
    if (pt.samples >= TRACE.samples) trace.on = trace.want = false; // converged: the canvas keeps the still
  }

  // controls
  const orbit = new OrbitControls(camera, canvas);
  orbit.enableDamping = true;
  orbit.dampingFactor = 0.08;
  orbit.maxPolarAngle = THREE.MathUtils.degToRad(89.5); // down to eye level for the street view
  orbit.minDistance = 8;
  orbit.maxDistance = 220;
  const homeTarget = new THREE.Vector3(0, 24, 0);
  const homeFrame = () => new THREE.Vector3(-40, 22, -88).multiplyScalar(Math.max(1, 1.2 / camera.aspect));
  const homePos = homeFrame();
  orbit.target.copy(homeTarget);
  camera.position.copy(homePos);
  const walk = new Walk(camera, canvas, [], []);

  // ---------- UI ----------
  const total = B.floors.reduce((a, f) => a + f.units.filter((u) => u.kind === 'apartment').length, 0);
  // floors by number
  const floorOf = (n) => B.floors.find((f) => f.floor === n);
  $('#meta').textContent = `16 floors · ${total} apartments`;
  const list = $('#floors');
  for (const f of [...B.floors].reverse()) {
    const li = document.createElement('li');
    const n = f.units.filter((u) => u.kind === 'apartment').length;
    li.innerHTML = `<b>${f.floor}</b><span>${f.floor === 1 ? `hall + ${n} flats` : `${n} apartments`}</span><i>${f.z.toFixed(2)} m</i>`;
    li.onclick = () => openFloor(f.floor);
    li.onmouseenter = () => { if (mode === 'building') hoverFloor(f.floor); };
    li.onmouseleave = () => { if (mode === 'building') hoverFloor(null); };
    f.li = li;
    list.append(li);
  }

  let mode = 'building', current = null, hovered = null, hoverUnit = null, tween = null;

  // ---------- on-demand rendering ----------
  // invalidate(): something visible changed -> redraw at full quality once
  // moving(): continuous change (cursor ring, keys held) -> fast frames for a moment
  // refreshShadows(): geometry/visibility changed -> recompute the (otherwise static) shadow map
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  let needFull = true, motionUntil = 0;
  const invalidate = () => { needFull = true; };
  const moving = (ms = 120) => { motionUntil = Math.max(motionUntil, performance.now() + ms); };
  const refreshShadows = () => { renderer.shadowMap.needsUpdate = true; invalidate(); };
  orbit.addEventListener('change', invalidate);
  const atm = new Atmosphere({ scene, renderer, camera, orbit, sun, hemi, sunDir, baseSky: sky, base: OUTDOOR, M, buildingRoot: B.root, site, complex, shadowFocus, invalidate, refreshShadows });
  addEventListener('keydown', () => moving(300));

  // Interiors: an apartment-type library. Each type (plan number on one floor-plan sheet, so the fit is
  // exact) is furnished once, on first need, and cached; every apartment of that type on any floor is a
  // lightweight instance sharing the same geometry. Only what is being looked at is ever built.
  let IM = null, IMK = null;
  const types = new Map();
  const loadInteriorMaterials = () => (IM ??= loadInteriorKit(M).then((K) => {
    // transmission makes three.js render the whole scene a second time (about a third of a floor-view frame);
    // the thin panes (shower screens, railings) look the same as plain transparent glass with reflections.
    // Only here: the 360° bake keeps the transmissive glass for Cycles.
    Object.assign(K.glass, { transmission: 0, transparent: true, opacity: 0.16, depthWrite: false, roughness: 0.04 });
    K.glass.color.set(0xdfe7e8);
    K.glass.needsUpdate = true;
    IMK = K;
    invalidate();
    return K;
  }));
  function unitType(f, number) {
    const key = data.sheets.indexOf(f.sheet) + ':' + number;
    if (!types.has(key)) {
      types.set(key, (async () => {
        const M = await loadInteriorMaterials();
        const t1 = performance.now();
        if (number === 'branch') await loadBranchModels(M);
        const tpl = number === 'branch' ? buildBranch(f, M, { shell: false }) : await furnishUnit(f, number, M);
        T['type' + key] = Math.round(performance.now() - t1);
        return tpl;
      })());
    }
    return types.get(key);
  }
  // the furnished instance of one apartment (built from its type on first use)
  async function ensureUnit(f, u) {
    f.interior ??= { group: Object.assign(new THREE.Group(), { visible: false }), units: new Map() };
    if (!f.interior.group.parent) { f.interior.group.position.y = f.z; B.root.add(f.interior.group); }
    if (f.interior.units.has(u.number)) return f.interior.units.get(u.number);
    const pending = (async () => {
      const tpl = await unitType(f, u.number);
      const group = new THREE.Group();
      for (const m of tpl.group.children) {
        const c = new THREE.Mesh(m.geometry, m.material); // shared geometry: no extra memory or build time
        c.castShadow = m.castShadow;
        c.receiveShadow = true;
        group.add(c);
      }
      clipMaterials(group);
      f.interior.group.add(group);
      for (const r of tpl.rooms) u.rooms ??= r.unit.rooms;
      refreshShadows();
      return { group, colliders: tpl.colliders, rooms: tpl.rooms.map((r) => ({ ...r, unit: u })) };
    })();
    f.interior.units.set(u.number, pending);
    return pending;
  }
  // a whole floor for the dollhouse view: every flat on it, each appearing as soon as it is ready
  async function ensureInterior(f) {
    const flats = f.units; // (with floor 1's commercial branch)
    const fresh = flats.some((u) => !types.has(data.sheets.indexOf(f.sheet) + ':' + u.number));
    if (fresh && current === f) $('#floor-sub').textContent = 'Furnishing apartments…';
    // one after another (each finishes and appears quickly) rather than all interleaved
    f.interior ??= { group: Object.assign(new THREE.Group(), { visible: false }), units: new Map() };
    if (!f.interior.group.parent) { f.interior.group.position.y = f.z; B.root.add(f.interior.group); }
    if (!f.interior.common) {
      const key = data.sheets.indexOf(f.sheet) + ':common';
      if (!types.has(key)) types.set(key, loadInteriorMaterials().then((M) => furnishCommon(f, M)));
      f.interior.common = types.get(key).then((tpl) => {
        const grp = new THREE.Group();
        for (const m of tpl.group.children) { const c = new THREE.Mesh(m.geometry, m.material); c.receiveShadow = true; c.castShadow = m.castShadow; grp.add(c); }
        grp.userData.common = true;
        clipMaterials(grp);
        f.interior.group.add(grp);
        refreshShadows();
      });
    }
    for (const u of flats) { await ensureUnit(f, u); invalidate(); }
    if (current === f) $('#floor-sub').textContent = floorSub(f);
    return f.interior;
  }
  // only the textures/materials are warmed up after start-up; furniture is built on demand
  // (no renderer.compileAsync() warm-up: it uploads uniforms without the clipping state these materials
  // use for the dollhouse cut, which breaks every later frame)
  const warmUp = () => loadInteriorMaterials().then(() => { T.materialsReady = Math.round(performance.now()); });
  // While nobody is interacting, pre-build the apartment types of the typical floors (4-5, 6-10, 11-16:
  // about 80% of all flats), one flat at a time, so most floors open instantly. Any input pauses it.
  let lastInput = performance.now();
  for (const ev of ['pointerdown', 'pointermove', 'wheel', 'keydown', 'touchstart']) addEventListener(ev, () => { lastInput = performance.now(); }, { passive: true });
  const whenIdle = () => new Promise((r) => {
    const check = () => (performance.now() - lastInput > 1200 && !tween ? r() : setTimeout(check, 250));
    check();
  });
  async function prebuildIdle() {
    await loadInteriorMaterials();
    for (const n of [8, 4, 12]) {
      const f = floorOf(n);
      for (const u of f.units.filter((x) => x.kind === 'apartment')) {
        await whenIdle();
        await unitType(f, u.number);
      }
    }
    T.idlePrebuildDone = Math.round(performance.now());
  }
  // dark "poche" on the cut wall tops, as on an architectural plan
  const CUT_H = 1.5;
  const capMat = new THREE.MeshBasicMaterial({ color: 0x5a534b });
  capMat.clippingPlanes = clipPlanes;
  function capsFor(f) {
    if (f.caps) return f.caps;
    const geos = f.sheet.walls
      .filter((r) => (r[2] - r[0]) * (r[3] - r[1]) > 0.004 && r[1] > f.box[1] - 0.3 && r[1] < f.box[3] + 0.3)
      .map((r) => new THREE.PlaneGeometry(r[2] - r[0], r[3] - r[1]).rotateX(-Math.PI / 2).translate((r[0] + r[2]) / 2 - CX, 0, (r[1] + r[3]) / 2 - CY));
    f.caps = new THREE.Mesh(mergeGeometries(geos), capMat);
    f.caps.position.y = f.z + CUT_H - 0.003;
    f.caps.visible = false;
    B.root.add(f.caps);
    return f.caps;
  }
  const floorSub = (f) => `${f.floor === 1 ? 'Commercial branch + ' : ''}${f.units.filter((u) => u.kind === 'apartment').length} apartments · level +${f.z.toFixed(2)} m`;
  // show one floor's interior; with `only`, just that apartment (walkthrough)
  const showInterior = (n, only = null) => {
    for (const f of B.floors) {
      if (!f.interior) continue;
      f.interior.group.visible = f.floor === n;
      if (f.floor === n) for (const c of f.interior.group.children) c.visible = !only || c === only;
    }
    invalidate();
  };
  const panel = $('#unit');

  function animate(pos, target, done, dur = 1.3) {
    tween = { p0: camera.position.clone(), t0: orbit.target.clone(), p1: pos, t1: target, t: 0, dur, done };
  }

  function hoverFloor(n) {
    hovered = n;
    invalidate();
    if (!n) { band.visible = false; $('#tip').hidden = true; return; }
    const f = floorOf(n);
    const hb = f.hit.geometry.parameters;
    band.scale.set(hb.width + 0.6, f.h, hb.depth + 0.6);
    band.position.copy(f.hit.position);
    band.visible = true;
    B.floors.forEach((x) => x.li.classList.toggle('hover', x.floor === n));
  }

  function setVisibleUpTo(n) {
    refreshShadows();
    for (const f of B.floors) f.group.visible = f.floor <= n;
    B.root.getObjectByName('podium').visible = n > 1;
    B.roof.visible = n >= 16 && mode === 'building';
  }

  function openFloor(n) {
    leaveApartment();
    if (seeingSun) wideLens(false);
    const f = floorOf(n);
    mode = 'floor';
    current = f;
    document.body.dataset.mode = 'floor';
    band.visible = false;
    setVisibleUpTo(n);
    B.roof.visible = false;
    B.floors.forEach((x) => { x.overlay.visible = x.floor === n; x.li.classList.toggle('on', x.floor === n); });
    $('#floor-title').textContent = `Floor ${n}`;
    $('#floor-sub').textContent = floorSub(f);
    atm.apply();
    cut.constant = f.z + CUT_H;
    const ready = ensureInterior(f); // creates the floor's interior group right away; flats pop in as built
    showInterior(n);
    B.floors.forEach((x) => { if (x.caps) x.caps.visible = false; });
    capsFor(f).visible = true;
    f.caps.position.y = f.z + CUT_H - 0.003;
    ready.then(() => { if (current === f && mode === 'floor') showInterior(n); });
    closeUnit();
    // floor 1 reaches 8.6 m further north than the tower: frame its centre
    const k = Math.max(1, 1.25 / camera.aspect) * (n === 1 ? 1.2 : 1);
    const cz = n === 1 ? (f.box[1] + f.box[3]) / 2 - CY : -1;
    animate(new THREE.Vector3(-4 * k, f.z + 34 * k, cz - 29 * k), new THREE.Vector3(0, f.z, cz));
  }

  function backToBuilding() {
    leaveApartment();
    mode = 'building';
    current = null;
    document.body.dataset.mode = 'building';
    atm.apply();
    setVisibleUpTo(16);
    B.roof.visible = true;
    B.floors.forEach((x) => { x.overlay.visible = false; x.li.classList.remove('on'); });
    $('#floor-title').textContent = 'Choose a floor';
    $('#floor-sub').textContent = 'Hover the building or pick from the list';
    showInterior(null);
    cut.constant = 1e6;
    B.floors.forEach((x) => { if (x.caps) x.caps.visible = false; });
    closeUnit();
    animate(homePos.clone(), homeTarget.clone());
  }

  function showUnit(u) {
    invalidate();
    panel.hidden = false;
    const branch = u.kind === 'commercial';
    $('#u-code').textContent = branch ? `${BRANCH.name} ${BRANCH.line}` : `Apartment ${u.code}`;
    $('#u-type').textContent = branch ? `Commercial branch · ${BRANCH.tagline}` : `${u.rooms ?? '–'}-room · plan №${u.number}`;
    $('#u-view').textContent = branch ? 'View branch' : 'View apartment';
    $('#u-pano').hidden = !hasPano(u);
    $('#u-area').textContent = u.area ? `${u.area.toFixed(2)} m²` : '–';
    $('#u-floor').textContent = `${u.floor}`;
    $('#u-status').textContent = STATUS[u.status].label;
    $('#u-status').style.color = `#${STATUS[u.status].color.toString(16).padStart(6, '0')}`;
    panel.dataset.unit = u.id;
    selectedUnit = u;
    for (const f of B.floors) for (const x of f.units) x.material.opacity = x === u ? SELECTED : BASE;
  }
  let selectedUnit = null;
  function focusUnit(u) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const r of u.rects) { x0 = Math.min(x0, r[0]); y0 = Math.min(y0, r[1]); x1 = Math.max(x1, r[2]); y1 = Math.max(y1, r[3]); }
    const c = new THREE.Vector3((x0 + x1) / 2 - CX, current.z + 0.5, (y0 + y1) / 2 - CY);
    const size = Math.max(x1 - x0, y1 - y0) * Math.max(1, 1.1 / camera.aspect);
    const north = (y0 + y1) / 2 < 9;
    animate(c.clone().add(new THREE.Vector3(-size * 0.15, size * 1.25, (north ? -1 : 1) * size * 0.55)), c);
  }
  function closeUnit() {
    invalidate();
    panel.hidden = true;
    selectedUnit = null;
    for (const f of B.floors) for (const x of f.units) x.material.opacity = BASE;
  }

  // free space score: distance to the nearest wall or piece of furniture
  const clearance = (px, pz, solids) => {
    let d = Infinity;
    for (const c of solids) d = Math.min(d, Math.hypot(Math.max(c.x0 - px, 0, px - c.x1), Math.max(c.z0 - pz, 0, pz - c.z1)));
    return d;
  };
  // best standing spot in some plan rectangles (world coords); optionally pulled towards a preferred point
  // cap: how much free space around the spot is worth; pull: how strongly the preferred point attracts
  function openSpot(rects, solids, prefer = null, { cap = 0.9, pull = 0.35, min = 0.28 } = {}) {
    let out = null, best = -Infinity, roomiest = null, most = -Infinity;
    for (const r of rects) {
      // narrow rooms (a 1 m hall) still get sample points along their centre line
      const mx = Math.min(0.3, (r[2] - r[0]) / 2), my = Math.min(0.3, (r[3] - r[1]) / 2);
      for (let x = r[0] + mx; x <= r[2] - mx + 1e-6; x += 0.15) {
        for (let y = r[1] + my; y <= r[3] - my + 1e-6; y += 0.15) {
          const px = x - CX, pz = y - CY;
          const free = clearance(px, pz, solids), c = Math.min(free, cap);
          const score = c - (prefer ? pull * Math.hypot(px - prefer[0], pz - prefer[1]) : 0);
          if (free > min && score > best) { best = score; out = [px, pz]; }
          if (free > most) { most = free; roomiest = [px, pz]; }
        }
      }
    }
    return out ?? roomiest ?? [(rects[0][0] + rects[0][2]) / 2 - CX, (rects[0][1] + rects[0][3]) / 2 - CY];
  }
  let walkCtx = null;
  // doorway of a room (to the hall when there is one) and a point 0.6 m inside it, world coords
  function entry(room) {
    const links = walkCtx?.doors?.get(room);
    if (!links?.length) return null;
    const l = links.find((x) => x.to.type === 'hall') ?? links[0];
    const q = room.inner ?? room.bbox;
    const c = [l.c[0] - CX, l.c[1] - CY], m = [(q[0] + q[2]) / 2 - CX, (q[1] + q[3]) / 2 - CY];
    const d = Math.hypot(m[0] - c[0], m[1] - c[1]) || 1, k = Math.min(0.6, d * 0.5);
    return [c, [c[0] + ((m[0] - c[0]) / d) * k, c[1] + ((m[1] - c[1]) / d) * k]];
  }
  // where to stand and look when visiting a room (world coords)
  function viewFor(room, from, x, y) {
    const { solids } = walkCtx;
    const q = room.inner ?? room.bbox;
    const mid = [(q[0] + q[2]) / 2 - CX, (q[1] + q[3]) / 2 - CY];
    let target, look, pitch = -0.05;
    if (x !== undefined && clearance(x - CX, y - CY, solids) > 0.3) {
      // a spot picked on the plan: face the way we were travelling
      target = [x - CX, y - CY];
      look = [target[0] * 2 - from[0], target[1] * 2 - from[1]];
    } else if (room.type === 'balcony') {
      // from just inside the balcony doors: door frame, curtains and balustrade frame the view
      // centre on the widest balcony door that opens onto this balcony (it may span two rooms)
      const doors = walkCtx.f.sheet.openings.filter((o) => o.kind === 'balconyDoor' && o.side === room.side && o.rect[2] > q[0] && o.rect[0] < q[2]);
      const door = doors.sort((a, b) => (b.rect[2] - b.rect[0]) - (a.rect[2] - a.rect[0]))[0];
      const dx = door ? (door.rect[0] + door.rect[2]) / 2 - CX : mid[0];
      const inside = room.side === 'north' ? q[3] - CY + 1.9 : q[1] - CY - 1.9;
      const flat = walkCtx.rooms.filter((r) => r.type !== 'balcony').flatMap((r) => r.rects);
      target = clearance(dx, inside, solids) > 0.25 ? [dx, inside] : openSpot(flat, solids, [dx, inside], { cap: 0.35, pull: 3.0, min: 0.3 });
      look = [dx, room.side === 'north' ? q[3] - CY : q[1] - CY]; // aim at the door itself so it sits centred in the frame
      pitch = -0.07;
    } else if (room.type === 'bedroom' && !room.kids && room.side) {
      // bedrooms: from the window corner looking back at the bed, which makes the bed the hero of the shot
      const winY = room.side === 'north' ? q[1] - CY + 0.7 : q[3] - CY - 0.7;
      const backY = room.side === 'north' ? q[3] - CY : q[1] - CY;
      const side = (q[2] - q[0]) * 0.22;
      target = openSpot(room.rects, solids, [mid[0] - side, winY], { cap: 0.4, pull: 1.4, min: 0.3 });
      look = [mid[0] + (mid[0] - target[0]) * 0.6, backY];
      pitch = -0.07;
    } else if (room.side && entry(room)) {
      // estate-photo shot: just inside the doorway (always clear of furniture), looking diagonally across
      // to the far window corner, which shows the full depth and width of the room
      const [door, inside] = entry(room);
      target = openSpot(room.rects, solids, inside, { cap: 0.5, pull: 1.2, min: 0.45 });
      const winY = room.side === 'north' ? q[1] - CY : q[3] - CY;
      const away = Math.sign(mid[0] - door[0]) || 1;
      look = [mid[0] + away * (q[2] - q[0]) * 0.22, winY];
    } else if (room.side) {
      const back = room.side === 'north' ? q[3] - CY - 0.4 : q[1] - CY + 0.4;
      target = openSpot(room.rects, solids, [mid[0], back], { cap: 0.5, pull: 1.0 });
      look = [mid[0], room.side === 'north' ? q[1] - CY : q[3] - CY];
    } else if (room.type === 'bath') {
      // bathrooms: aim at the fixtures drawn in the room, from the far side of it
      const fx = (walkCtx.f.sheet.fixtures ?? []).filter((o) => { const c = [(o.rect[0] + o.rect[2]) / 2, (o.rect[1] + o.rect[3]) / 2]; return c[0] > q[0] - 0.1 && c[0] < q[2] + 0.1 && c[1] > q[1] - 0.1 && c[1] < q[3] + 0.1; });
      look = fx.length ? [fx.reduce((a, o) => a + (o.rect[0] + o.rect[2]) / 2, 0) / fx.length - CX, fx.reduce((a, o) => a + (o.rect[1] + o.rect[3]) / 2, 0) / fx.length - CY] : mid;
      const e = entry(room);
      target = e ? openSpot(room.rects, solids, e[1], { cap: 0.3, pull: 1.6, min: 0.22 }) : openSpot(room.rects, solids, [mid[0] * 2 - look[0], mid[1] * 2 - look[1]]);
      if (Math.hypot(look[0] - target[0], look[1] - target[1]) < 0.5) look = [target[0] * 2 - from[0], target[1] * 2 - from[1]];
      pitch = -0.28;
    } else {
      // small rooms: stand at the side you come in from and look across
      const near = [mid[0] + Math.sign(from[0] - mid[0]) * (q[2] - q[0]) * 0.35, mid[1] + Math.sign(from[1] - mid[1]) * (q[3] - q[1]) * 0.35];
      target = openSpot(room.rects, solids, near);
      look = mid;
    }
    const dx = look[0] - target[0], dz = look[1] - target[1];
    const yaw = Math.hypot(dx, dz) > 0.2 ? Math.atan2(-dx, -dz) : walk.yaw;
    return { room, target, yaw, pitch };
  }
  // glide to a standing spot at eye level (walls intact)
  function glide(target, yaw, pitch, dur, then) {
    walk.enabled = false;
    walk.frame(0);
    const pose = walk.poseFor(target[0], target[1], yaw, pitch);
    tween = { p0: camera.position.clone(), q0: camera.quaternion.clone(), p1: pose.p, q1: pose.q, t: 0, dur, walk: true,
      done: () => { walk.place(target[0], target[1], yaw, pitch); walk.enabled = true; then?.(); } };
  }
  function goTo(room, x, y) {
    if (!walkCtx || tween) return;
    const from = [walk.pos.x, walk.pos.y];
    const { target, yaw, pitch } = viewFor(room, from, x, y);
    plan.target = [target[0] + CX, target[1] + CY];
    const dist = Math.hypot(target[0] - from[0], target[1] - from[1]);
    glide(target, yaw, pitch, Math.min(1.6, 0.5 + dist * 0.18), () => { plan.target = null; announce(room); });
  }
  // big room name in the middle of the screen for about a second on arrival
  let titleTimer = 0;
  function announce(room) {
    const el = $('#room-title');
    el.innerHTML = `<b>${nameOf(room)}</b><span>${room.area.toFixed(1)} m²</span>`;
    el.classList.remove('show');
    void el.offsetWidth; // restart the fade
    el.classList.add('show');
    clearTimeout(titleTimer);
    titleTimer = setTimeout(() => el.classList.remove('show'), 1300);
  }
  const plan = new UnitPlan($('#plan'), (room, x, y) => (mode === 'walk' ? goTo(room, x, y) : focusRoom(room)));
  const aids = new NavAids({ scene, camera, canvas, layer: $('#signs'), pad: $('#pad'), walk, onGo: (room) => goTo(room), onChange: () => moving(60) });

  const EYE = 1.6, WALK_FOV = 80;
  // indoors: less flat fill light so materials keep their colour and depth
  // walk-through: filmic (ACES) tone mapping at exposure 1.0, softer fill, sun ~2.5 through the windows
  const interiorLight = (on) => { atm.interior = on; atm.apply(); };

  // ---------- apartment dollhouse (the main way to see a flat) ----------
  // Just this apartment, ceiling off, on a dark studio backdrop, seen from above like an architect's
  // presentation model; rooms are framed from a 3/4 overhead angle. Walls are only ever removed here,
  // where visitors expect it - at eye level they always stay intact.
  const STUDIO = new THREE.Color(0x24211d);
  const studioFloor = new THREE.Mesh(new THREE.CircleGeometry(80, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2b2723, roughness: 1 }));
  studioFloor.visible = false;
  studioFloor.receiveShadow = true;
  scene.add(studioFloor);
  function surroundings(on) {
    site.visible = complex.visible = on;
    studioFloor.visible = !on;
    atm.setStudio(!on);
    if (!on) scene.background = STUDIO;
    invalidate();
  }
  function isolate(f, box) {
    if (!box) { for (const p of roomClip) p.constant = 1e6; return; }
    const m = 0.25;
    roomClip[0].constant = -(box[0] - CX - m); roomClip[1].constant = box[2] - CX + m;
    roomClip[2].constant = -(box[1] - CY - m); roomClip[3].constant = box[3] - CY + m;
    roomClip[4].constant = -(f.z - 0.3);
  }
  const unitBox = (u, rooms) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const q of [...u.rects, ...rooms.map((r) => r.bbox)]) { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[2]); y1 = Math.max(y1, q[3]); }
    return [x0, y0, x1, y1];
  };
  const DOLL_ELEV = THREE.MathUtils.degToRad(52);
  function overheadPose(c, dist, az, elev = DOLL_ELEV) {
    return c.clone().add(new THREE.Vector3(Math.sin(az) * Math.cos(elev) * dist, Math.sin(elev) * dist, Math.cos(az) * Math.cos(elev) * dist));
  }
  // look from the side away from the windows, slightly turned for a 3/4 view
  const azFor = (side, fallback) => (side === 'north' ? 0.45 : side === 'south' ? Math.PI + 0.45 : fallback);
  const currentAz = () => Math.atan2(camera.position.x - orbit.target.x, camera.position.z - orbit.target.z);
  const fit = () => Math.max(1, 1.15 / camera.aspect);

  async function enterUnit(u, room = null) {
    stopTour();
    if (mode === 'walk') leaveWalk();
    const f = floorOf(u.floor);
    current = f;
    const ui = await ensureUnit(f, u);
    mode = 'unit';
    document.body.dataset.mode = 'unit';
    panel.hidden = true;
    band.visible = false;
    $('#tip').hidden = true;
    setVisibleUpTo(u.floor);
    B.roof.visible = false;
    f.overlay.visible = false;
    if (f.caps) f.caps.visible = false;
    showInterior(u.floor, ui.group);
    walkCtx = { f, u, ui, solids: f.colliders.concat(ui.colliders), rooms: ui.rooms };
    walkCtx.doors = aids.findDoorways(ui.rooms, f.sheet.walls);
    walkCtx.box = unitBox(u, ui.rooms);
    cut.constant = f.z + 2.3; // walls stay, ceiling goes
    isolate(f, walkCtx.box);
    shadowFocus(new THREE.Vector3((walkCtx.box[0] + walkCtx.box[2]) / 2 - CX, f.z, (walkCtx.box[1] + walkCtx.box[3]) / 2 - CY));
    capsFor(f).visible = true;
    const b = walkCtx.box;
    studioFloor.position.set((b[0] + b[2]) / 2 - CX, f.z - 0.32, (b[1] + b[3]) / 2 - CY);
    surroundings(false);
    refreshShadows();
    plan.open({ unit: u, rooms: ui.rooms, walls: ui.walls ?? f.sheet.walls, furniture: ui.colliders });
    $('#walk-pano').hidden = !hasPano(u);
    orbit.enabled = true;
    orbit.minDistance = 3;
    $('#hint-text').textContent = 'Drag to turn · scroll to zoom · click a room to focus on it';
    if (room) focusRoom(room); else focusApartment();
  }
  function focusApartment() {
    const f = walkCtx.f, b = walkCtx.box;
    const c = new THREE.Vector3((b[0] + b[2]) / 2 - CX, f.z + 0.4, (b[1] + b[3]) / 2 - CY);
    const size = Math.max(b[2] - b[0], b[3] - b[1]);
    const side = (b[1] + b[3]) / 2 < 9 ? 'north' : 'south';
    walk.pos.set(c.x, c.z);
    cut.constant = f.z + 2.3;
    refreshShadows();
    if (f.caps) f.caps.position.y = cut.constant - 0.003;
    animate(overheadPose(c, (size * 1.15 + 5.5) * fit(), azFor(side, 0)), c);
  }
  function focusRoom(room) {
    if (!walkCtx) return;
    const q = room.inner ?? room.bbox;
    const c = new THREE.Vector3((q[0] + q[2]) / 2 - CX, walkCtx.f.z + 0.5, (q[1] + q[3]) / 2 - CY);
    const size = Math.max(q[2] - q[0], q[3] - q[1]);
    walk.pos.set(c.x, c.z); // the plan highlights the room being looked at
    // small rooms (bathrooms, halls) are seen almost from above with lower-cut walls, or their own walls hide them
    const small = room.type === 'bath' || room.type === 'hall' || size < 3.2;
    cut.constant = walkCtx.f.z + (small ? 1.25 : 2.3);
    refreshShadows();
    if (walkCtx.f.caps) walkCtx.f.caps.position.y = cut.constant - 0.003;
    const elev = THREE.MathUtils.degToRad(small ? 74 : 55);
    animate(overheadPose(c, (size * 1.7 + (small ? 4.6 : 5.6)) * fit(), azFor(room.side, currentAz()), elev), c, () => announce(room), 1.1);
  }
  function leaveApartment() {
    stopTour();
    if (mode === 'walk') leaveWalk();
    if (!walkCtx) return;
    plan.close();
    isolate(null);
    surroundings(true);
    shadowFocus(null);
    refreshShadows();
    walkCtx = null;
    orbit.minDistance = 8;
  }

  // ---------- eye-level walk (optional) ----------
  // show-flats (enlarged walk-through versions), one per apartment type, built on first walk-in
  const showflats = new Map();
  function showflatFor(f, u) {
    const key = data.sheets.indexOf(f.sheet) + ':' + u.number;
    if (!showflats.has(key)) {
      showflats.set(key, loadInteriorMaterials().then(async (K) => {
        if (u.kind === 'commercial') await loadBranchModels(K);
        const sf = u.kind === 'commercial' ? buildBranch(f, K) : await buildShowflat({ ...f, sheetIndex: data.sheets.indexOf(f.sheet) }, u, K, M.wall);
        clipMaterials(sf.group);
        sf.group.visible = false;
        scene.add(sf.group);
        return sf;
      }));
    }
    return showflats.get(key);
  }
  async function walkInto(u) {
    if (mode !== 'unit' || walkCtx?.u !== u) await enterUnit(u);
    $('#hint-text').textContent = 'Preparing walk-through…';
    const sf = await showflatFor(walkCtx.f, u);
    const realF = walkCtx.f;
    // walk the show-flat: the real building floors step aside, the enlarged flat takes their place
    sf.group.position.y = realF.z;
    sf.group.visible = true;
    walkCtx = { ...walkCtx, sf, solids: sf.colliders, rooms: sf.rooms, f: { z: realF.z, h: sf.h + 0.22, sheet: sf.sheet, colliders: sf.wallColliders, floor: realF.floor } };
    walkCtx.doors = aids.findDoorways(sf.rooms, sf.sheet.walls);
    plan.open({ unit: sf.unit, rooms: sf.rooms, walls: sf.sheet.walls, furniture: sf.colliders });
    u = { ...u, rects: sf.unit.rects };
    const { f, solids } = walkCtx;
    const ui = { rooms: sf.rooms, group: sf.group };
    stopTour();
    cut.constant = 1e6;
    if (f.caps) f.caps.visible = false;
    isolate(null);
    surroundings(true);
    mode = 'walk';
    document.body.dataset.mode = 'walk';
    for (const x of B.floors) x.group.visible = false;
    showInterior(null);
    B.root.getObjectByName('podium').visible = false;
    B.roof.visible = false;
    refreshShadows();
    orbit.enabled = false;
    const [cx, cz] = openSpot(u.rects, solids);
    const north = cz + CY < 9;
    aids.open(ui.rooms.map((r) => viewFor(r, [cx, cz])), f.z, f.colliders, f.sheet.walls);
    walk.colliders = solids;
    walk.floors = [ui.group];
    // estate-photo framing: about a 16 mm lens from the doorway/corner at chest height
    walk.eye = f.z + EYE;
    camera.fov = WALK_FOV;
    camera.updateProjectionMatrix();
    interiorLight(true);
    $('#hint-text').textContent = 'Click a room sign or the floor to go there · drag to look around';
    const living = ui.rooms.find((r) => r.type === 'living');
    const v = living ? viewFor(living, [cx, cz]) : { target: [cx, cz], yaw: north ? 0 : Math.PI, pitch: -0.05 };
    glide(v.target, v.yaw, v.pitch, 1.6, () => living && announce(living));
  }
  function leaveWalk() {
    stopTrace();
    walk.enabled = false;
    if (walkCtx?.sf) walkCtx.sf.group.visible = false;
    aids.close();
    walk.frame(0);
    camera.fov = 40;
    camera.updateProjectionMatrix();
    interiorLight(false);
  }

  // ---------- guided tour: a slow turntable around each room in the dollhouse ----------
  let tour = null;
  const frameTick = () => new Promise((r) => requestAnimationFrame(r));
  const waitTween = async () => { while (tween) await frameTick(); };
  const TOUR_ORDER = { hall: 0, living: 1, bedroom: 2, bath: 3, balcony: 4 };
  async function startTour(u) {
    stopTour();
    if (mode !== 'unit' || walkCtx?.u !== u) await enterUnit(u);
    const me = (tour = { stopped: false });
    await waitTween();
    const rooms = [...walkCtx.rooms]
      .sort((a, b) => (TOUR_ORDER[a.type] ?? 5) - (TOUR_ORDER[b.type] ?? 5) || (a.kids ? 1 : 0) - (b.kids ? 1 : 0) || b.area - a.area);
    document.body.dataset.tour = '1';
    orbit.enabled = false;
    const cap = $('#tour-caption');
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < rooms.length && !me.stopped; i++) {
      const r = rooms[i];
      cap.innerHTML = `<b>${nameOf(r)}</b><span>${r.area.toFixed(1)} m²</span><i>${i + 1} / ${rooms.length}</i>`;
      $('#tour-bar').style.width = `${((i + 1) / rooms.length) * 100}%`;
      focusRoom(r);
      await waitTween();
      const hold = performance.now();
      while (!me.stopped && performance.now() - hold < 1200) await frameTick();
      // turntable: circle the room once, slowly, keeping it centred
      const t = orbit.target.clone(), off = camera.position.clone().sub(t);
      const dur = r.area < 6 ? 7000 : 10000, t0 = performance.now();
      while (!me.stopped) {
        const k = Math.min(1, (performance.now() - t0) / dur);
        const a = (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2) * Math.PI * 2;
        camera.position.copy(t).add(off.clone().applyAxisAngle(up, a));
        camera.lookAt(t);
        if (k >= 1) break;
        await frameTick();
      }
    }
    if (tour === me) { stopTour(); focusApartment(); }
  }
  function stopTour() {
    if (!tour) return;
    tour.stopped = true;
    tour = null;
    orbit.enabled = mode !== 'walk';
    delete document.body.dataset.tour;
    invalidate();
  }
  // user input on the 3D view takes over from the tour
  canvas.addEventListener('pointerdown', () => stopTour(), true);
  addEventListener('keydown', (e) => { if (tour && e.code !== 'Space') stopTour(); });
  addEventListener('wheel', () => stopTour(), { passive: true });

  $('#back').onclick = backToBuilding;
  $('#u-close').onclick = closeUnit;
  $('#u-view').onclick = () => selectedUnit && enterUnit(selectedUnit);
  $('#u-walk').onclick = () => selectedUnit && walkInto(selectedUnit);
  $('#u-tour').onclick = () => selectedUnit && startTour(selectedUnit);
  $('#walk-tour').onclick = () => walkCtx && startTour(walkCtx.u);
  $('#walk-in').onclick = () => walkCtx && walkInto(walkCtx.u);
  $('#tour-stop').onclick = stopTour;

  // ---------- 360° tour (photoreal renders of floors 1-2) ----------
  const allUnits = B.floors.flatMap((f) => f.units);
  const pano = new PanoViewer($('#pano'), {
    // "3D view" from the tour: walk the same flat in real time
    on3D: (id) => { const u = allUnits.find((x) => panoId(x) === id); if (u) walkInto(u); else if (id === 'exterior') streetView(); },
  });
  const openPano = (u, stop = null, design = null) => { if (u && hasPano(u)) { stopTour(); pano.open(panoId(u), stop, design); } };
  $('#u-pano').onclick = () => openPano(selectedUnit);
  $('#walk-pano').onclick = () => openPano(walkCtx?.u);
  // shareable link: #pano=<tour id>/<room>/<design>
  const deep = location.hash.match(/^#pano=([\w-]+)(?:\/([\w-]+))?(?:\/([\w-]+))?/);
  if (deep) openPano(allUnits.find((x) => panoId(x) === deep[1]), deep[2], deep[3]);

  // ---------- street view: the building front at eye level from the zebra crossing ----------
  function streetView() {
    backToBuilding();
    const v = STREET_VIEWS[0];
    animate(new THREE.Vector3(v.pos[0], 1.7, v.pos[2]), new THREE.Vector3(v.look[0], 1.2, v.look[2]), null, 2.2);
  }
  $('#street').onclick = streetView;
  $('#outside-360').onclick = () => { stopTour(); pano.open('exterior'); };
  atm.bindUI($);
  const showcase = new Showcase({ $, atm, camera, orbit, pano, animate, cancelMove: () => { tween = null; }, openFloor, backToBuilding, enterUnit, focusRoom, roomsNow: () => walkCtx?.rooms ?? [], ensureInterior, floorOf, panoId, site, complex, refreshShadows });
  $('#showcase-start').onclick = () => showcase.start(60);
  $('#showcase-long').onclick = () => showcase.start(120);
  if (location.hash === '#showcase') showcase.start(60);
  if (location.hash === '#showcase-2') showcase.start(120);
  // a high wide view towards the sun, over the rooftops, with the tower in the frame; again: back to the home view
  let seeingSun = false;
  const wideLens = (on, fov = 66) => { camera.fov = on ? fov : 40; camera.updateProjectionMatrix(); orbit.maxPolarAngle = on ? Math.PI - 0.05 : THREE.MathUtils.degToRad(89.5); $('#sky-see').textContent = on ? 'Back' : 'See the sun'; seeingSun = on; };
  atm.onSeeSun = () => {
    if (seeingSun) { wideLens(false); backToBuilding(); return; }
    backToBuilding();
    const d = atm.skyBody, ground = new THREE.Vector3(d.x, 0, d.z).normalize(), side = new THREE.Vector3(-ground.z, 0, ground.x);
    const pos = ground.clone().multiplyScalar(-135).addScaledVector(side, 48).setY(68);
    const toTower = new THREE.Vector3(0, 40, 0).sub(pos).normalize();
    const apart = THREE.MathUtils.radToDeg(toTower.angleTo(d));
    const look = toTower.multiplyScalar(0.8).add(d).normalize(); // between the two, a little towards the sun
    wideLens(true, Math.min(92, Math.max(58, apart + 14))); // a high sun needs a wider lens
    animate(pos, pos.clone().addScaledVector(look, 60));
  };
  // Back: walk -> apartment -> floor -> building
  const goBack = () => {
    if (mode === 'walk') enterUnit(walkCtx.u);
    else if (mode === 'unit') { const f = current; leaveApartment(); openFloor(f.floor); }
    else if (mode === 'floor') backToBuilding();
  };
  $('#exit-walk').onclick = goBack;
  addEventListener('keydown', (e) => { if (e.code === 'Escape') goBack(); });

  // picking
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let down = null;
  const pick = (e, objs) => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    return ray.intersectObjects(objs, false)[0];
  };
  canvas.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
  canvas.addEventListener('pointermove', (e) => {
    if (tween || mode === 'walk') return;
    const tip = $('#tip');
    if (mode === 'building') {
      const h = pick(e, B.floors.map((f) => f.hit));
      const n = h?.object.userData.floor ?? null;
      if (n !== hovered) hoverFloor(n);
      if (n) {
        const f = floorOf(n);
        tip.hidden = false;
        tip.innerHTML = `<b>Floor ${n}</b> · ${f.units.filter((u) => u.kind === 'apartment').length} apartments`;
        tip.style.transform = `translate(${e.clientX + 14}px, ${e.clientY + 14}px)`;
      }
      canvas.style.cursor = n ? 'pointer' : '';
    } else if (mode === 'floor') {
      const h = pick(e, current.overlay.children);
      const u = h?.object.userData.unit ?? null;
      if (u !== hoverUnit) {
        if (hoverUnit && hoverUnit !== selectedUnit) hoverUnit.material.opacity = BASE;
        hoverUnit = u;
        if (u && u !== selectedUnit) u.material.opacity = HOVER;
        invalidate();
      }
      tip.hidden = !u;
      if (u) {
        tip.innerHTML = u.kind === 'commercial' ? `<b>${BRANCH.name} ${BRANCH.line}</b> · commercial branch · ${u.area.toFixed(1)} m²` : `<b>${u.code}</b> · ${u.rooms}-room · ${u.area?.toFixed(1)} m²`;
        tip.style.transform = `translate(${e.clientX + 14}px, ${e.clientY + 14}px)`;
      }
      canvas.style.cursor = u ? 'pointer' : '';
    }
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5 || tween) return;
    if (mode === 'building' && hovered) openFloor(hovered);
    else if (mode === 'unit' && walkCtx) {
      // click a room in the dollhouse to focus on it
      const h = pick(e, walkCtx.ui.group.children);
      const room = h && plan.roomAt(h.point.x + CX, h.point.z + CY);
      if (room) focusRoom(room);
    } else if (mode === 'floor') {
      const h = pick(e, current.overlay.children);
      if (h) { showUnit(h.object.userData.unit); focusUnit(h.object.userData.unit); }
      else closeUnit();
    }
  });
  canvas.addEventListener('pointerleave', () => { $('#tip').hidden = true; });

  loadBar.style.width = '100%';
  $('#loader').classList.add('done');
  warmUp();
  prebuildIdle();
  document.body.dataset.mode = 'building';

  // the scene renders into the composer's targets, so the resolution changes there, not just on the canvas
  // (render targets are reallocated, so small steps are ignored)
  function setResolution(pr) {
    if (Math.abs(composer._pixelRatio - pr) < 0.05) return;
    renderer.setPixelRatio(pr);
    composer.setPixelRatio(pr);
  }
  const clock = new THREE.Timer();
  const lastCam = new THREE.Matrix4();
  let stillSince = 0, scale = 1, slowFrames = 0, fastFrames = 0, lastFast = 0;
  function frame(t) {
    requestAnimationFrame(frame); // schedule first so one bad frame can't stop the loop
    clock.update(t);
    if (document.body.dataset.pano) { needFull = true; return; } // the 360° tour covers the view
    const dt = Math.min(clock.getDelta(), 0.05);
    const now = performance.now();
    fitToWindow();
    if (tween) {
      tween.t = Math.min(1, tween.t + dt / tween.dur);
      const k = tween.t < 0.5 ? 4 * tween.t ** 3 : 1 - (-2 * tween.t + 2) ** 3 / 2;
      if (tween.walk) {
        camera.position.lerpVectors(tween.p0, tween.p1, k);
        camera.quaternion.slerpQuaternions(tween.q0, tween.q1, k);
      } else {
        camera.position.lerpVectors(tween.p0, tween.p1, k);
        orbit.target.lerpVectors(tween.t0, tween.t1, k);
        camera.lookAt(orbit.target);
      }
      if (tween.t >= 1) { const d = tween.done; tween = null; d?.(); }
    } else if (mode !== 'walk') orbit.update();
    walk.update(dt);
    if ((mode === 'walk' || mode === 'unit') && walkCtx) plan.draw(camera, walk);
    if (mode === 'walk' && walkCtx) aids.update(t / 1000, plan.roomAt(walk.pos.x + CX, walk.pos.y + CY));
    camera.updateMatrixWorld();
    const camMoved = !lastCam.equals(camera.matrixWorld);
    if (camMoved) lastCam.copy(camera.matrixWorld);
    atm.tick(now);
    if (camMoved || tween || now < motionUntil) {
      // moving: no ambient occlusion (about three quarters of the frame cost at full HD), MSAA kept,
      // resolution adapted to keep the frame rate up; AO comes back on the settled frame
      const gap = now - lastFast;
      lastFast = now;
      // only sustained slowness lowers the resolution (one-off spikes, e.g. building an interior, don't),
      // never below 60%, and it recovers quickly
      if (gap < 100) {
        if (gap > 24) { fastFrames = 0; if (++slowFrames >= 6) { scale = Math.max(0.6, scale * 0.88); slowFrames = 0; } }
        else if (gap < 18) { slowFrames = 0; if (++fastFrames >= 15) { scale = Math.min(1, scale * 1.1); fastFrames = 0; } }
      }
      stopTrace();
      const pr = Math.max(0.6, Math.min(dpr, 1.5) * scale);
      setResolution(pr);
      setStill(false);
      composer.render();
      stillSince = now;
      needFull = true;
      setMoving(true);
    } else if (atm.animating) {
      // rain or snow falling: light frames, with no path-traced still, while nothing else moves
      stopTrace();
      setResolution(Math.max(0.6, Math.min(dpr, 1.5) * scale));
      setMoving(false);
      setStill(false);
      composer.render();
      needFull = true;
    } else if (needFull && now - stillSince > 150) {
      // settled: one full-quality frame, then (inside a flat) the path-traced still, then nothing until
      // something changes
      stopTrace();
      scale = 1;
      setResolution(dpr);
      setMoving(false);
      setStill(true);
      composer.render();
      needFull = false;
      wantTrace();
    } else traceStep();
  }
  // while the camera moves, labels/signs/markers step aside for a clean view
  let movingNow = false;
  function setMoving(on) {
    if (on === movingNow) return;
    movingNow = on;
    if (on) document.body.dataset.moving = '1'; else delete document.body.dataset.moving;
    if (mode === 'walk') aids.exits.visible = aids.group.visible = !on && !tour;
  }
  requestAnimationFrame(frame);

  // follow the window size; checked every frame because resize events can be missed while hidden
  const drawn = renderer.getSize(new THREE.Vector2());
  let vw = drawn.x, vh = drawn.y; // what was actually drawn at: 0 if the window was hidden at load
  function fitToWindow() {
    if (!innerWidth || !innerHeight || (innerWidth === vw && innerHeight === vh)) return; // 0 = hidden window
    const firstSize = !vw || !vh;
    vw = innerWidth; vh = innerHeight;
    camera.aspect = vw / vh;
    camera.updateProjectionMatrix();
    if (firstSize) camera.position.copy(homePos.copy(homeFrame())); // the home view depends on the real aspect
    renderer.setSize(vw, vh);
    composer.setSize(vw, vh);
    gtao.setSize(vw * dpr, vh * dpr);
    invalidate();
  }
  addEventListener('resize', fitToWindow);
  document.addEventListener('visibilitychange', () => { fitToWindow(); invalidate(); });
  window.__b = { atm, showcase, scene, camera, renderer, composer, gtao, ssaaPass, renderPass, B, pt, trace, TRACE, openFloor, backToBuilding, showUnit, walkInto, orbit, focusUnit, cut, walk, aids, plan, invalidate, startTour, stopTour, enterUnit, focusRoom, render: () => composer.render(),
    // profiling: scene size + GPU-synced render time with features toggled
    perf: () => {
      const gl = renderer.getContext();
      const time = (n = 8) => { composer.render(); gl.finish(); const a = performance.now(); for (let i = 0; i < n; i++) composer.render(); gl.finish(); return +((performance.now() - a) / n).toFixed(1); };
      let tris = 0, meshes = 0;
      scene.traverseVisible((o) => { if (o.isMesh) { meshes++; const g = o.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3; } });
      composer.render();
      const info = { load: T, meshes, tris: Math.round(tris), calls: renderer.info.render.calls, frameTris: renderer.info.render.triangles, size: [renderer.domElement.width, renderer.domElement.height] };
      info.full = time();
      sun.shadow.autoUpdate = false; info.noShadowUpdate = time(); sun.shadow.autoUpdate = true;
      gtao.enabled = false; info.noAO = time(); gtao.enabled = true;
      return info;
    },
    skip: () => { if (!tween) return; camera.position.copy(tween.p1); if (tween.q1) camera.quaternion.copy(tween.q1); else { orbit.target.copy(tween.t1); camera.lookAt(orbit.target); } const d = tween.done; tween = null; d?.(); walk.update(0); if (walkCtx) { plan.draw(camera, walk); aids.update(0, plan.roomAt(walk.pos.x + CX, walk.pos.y + CY)); } } };
}

init().catch((e) => {
  console.error(e);
  loadText.textContent = `Error: ${e.message}`;
});
