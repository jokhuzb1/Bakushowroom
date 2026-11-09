// Time of day and weather for the 3D view. "Day" is the showroom's own flattering light (the sun placed to light the
// street front). Every other time is the real sun at LATITUDE on a midsummer or midwinter day, drawn in the sky with
// its path, assuming the drawings' north is true north. Rain and snow are GPU particles that stay out of the building.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BLOCKS } from './complex.js';
import { makeSky } from '../textures.js';
import { CX, CY } from './model.js';

const LATITUDE = 41; // degrees north: Baku and Tashkent both sit at about 41°
const DECLINATION = { summer: 23.4, winter: -23.4 };
const R = 600; // the sky dome's radius around the plot
const CENTER = new THREE.Vector3(23, 0, 40);
const rad = THREE.MathUtils.degToRad;

// the sun at solar time `hour`: plan north is -z, east is +x
export function sunAt(hour, season) {
  const lat = rad(LATITUDE), dec = rad(DECLINATION[season]), h = rad(15 * (hour - 12));
  const alt = Math.asin(Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(h));
  const az = Math.atan2(Math.sin(h), Math.cos(h) * Math.sin(lat) - Math.tan(dec) * Math.cos(lat)); // from south, towards west
  return { alt: THREE.MathUtils.radToDeg(alt), dir: new THREE.Vector3(-Math.cos(alt) * Math.sin(az), Math.sin(alt), Math.cos(alt) * Math.cos(az)) };
}
// the hour the sun stands at `alt` degrees, in the morning or the evening
function hourAtAltitude(alt, evening, season) {
  let a = 12, b = evening ? 24 : 0;
  for (let i = 0; i < 24; i++) {
    const m = (a + b) / 2;
    if (sunAt(m, season).alt > alt) a = m; else b = m;
  }
  return a;
}

// the look of the sky and the light by the sun's altitude (degrees); between two keys they blend
const KEYS = [
  { a: -16, zen: [0.004, 0.007, 0.022], hor: [0.02, 0.03, 0.06], glow: [0, 0, 0], cloud: [0.02, 0.025, 0.04], ground: 0.03, sun: 0, col: [1, 1, 1], env: 0.9, hemi: 0.06, exp: 0.95, night: 1 },
  { a: -5, zen: [0.03, 0.05, 0.17], hor: [0.42, 0.26, 0.32], glow: [0.6, 0.25, 0.2], cloud: [0.3, 0.2, 0.28], ground: 0.12, sun: 0, col: [1, 0.5, 0.3], env: 0.6, hemi: 0.08, exp: 0.9, night: 0.75 },
  { a: 3, zen: [0.12, 0.18, 0.45], hor: [1.1, 0.55, 0.28], glow: [1.4, 0.6, 0.2], cloud: [1.15, 0.6, 0.45], ground: 0.4, sun: 3.5, col: [1, 0.52, 0.24], env: 0.4, hemi: 0.15, exp: 0.95, night: 0.1 },
  { a: 12, zen: [0.12, 0.26, 0.7], hor: [0.95, 0.75, 0.6], glow: [1.1, 0.8, 0.5], cloud: [1.2, 1, 0.85], ground: 0.8, sun: 4.5, col: [1, 0.76, 0.52], env: 0.42, hemi: 0.22, exp: 0.85, night: 0 },
  { a: 35, zen: [0.12, 0.3, 0.85], hor: [0.62, 0.76, 0.95], glow: [1, 0.85, 0.6], cloud: [1.25, 1.25, 1.25], ground: 1, sun: 5, col: [1, 0.9, 0.78], env: 0.45, hemi: 0.25, exp: 0.85, night: 0 },
];
const lerpArr = (p, q, t) => p.map((v, i) => v + (q[i] - v) * t);
function keyAt(alt) {
  const a = Math.max(KEYS[0].a, Math.min(KEYS[KEYS.length - 1].a, alt));
  let i = 0;
  while (i < KEYS.length - 2 && a > KEYS[i + 1].a) i++;
  const p = KEYS[i], q = KEYS[i + 1], t = (a - p.a) / (q.a - p.a), out = {};
  for (const k of Object.keys(p)) out[k] = Array.isArray(p[k]) ? lerpArr(p[k], q[k], t) : p[k] + (q[k] - p[k]) * t;
  return out;
}
const MOON = new THREE.Vector3(-0.35, 0.72, -0.6).normalize(); // high over the street front

function radial(stops, size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) r.addColorStop(o, col);
  g.fillStyle = r;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const glowSprite = (map, color, scale) => {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false }));
  s.scale.setScalar(scale);
  return s;
};
function hourLabel(text) {
  const c = document.createElement('canvas');
  c.width = 192; c.height = 80;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(24, 20, 16, 0.82)';
  g.beginPath();
  g.roundRect(6, 6, 180, 68, 22);
  g.fill();
  g.font = '600 46px "Segoe UI", Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#ffe9c4';
  g.fillText(text, 96, 42);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, fog: false }));
  s.scale.set(44, 18, 1);
  return s;
}

// ---------- rain and snow ----------
const COMMON = /* glsl */`
  uniform float uTime, uFall;
  uniform vec3 uCam, uBox;
  uniform vec2 uWind;
  uniform vec4 uTower, uPodium; // x0, z0, x1, z1 of the building; particles inside are dropped
  attribute vec4 aSeed;
  vec3 place(float sway) {
    vec3 org = vec3(uCam.x - uBox.x * 0.5, 0.0, uCam.z - uBox.z * 0.5);
    vec3 p = aSeed.xyz * uBox;
    p.y -= uTime * uFall * (0.85 + 0.3 * aSeed.w);
    p.xz += uTime * uWind + sway * vec2(sin(uTime * 0.7 + aSeed.w * 40.0), cos(uTime * 0.5 + aSeed.w * 25.0));
    return mod(p - org, uBox) + org;
  }
  bool indoors(vec3 p) {
    return (p.y < 51.2 && p.x > uTower.x && p.x < uTower.z && p.z > uTower.y && p.z < uTower.w)
      || (p.y < 4.9 && p.x > uPodium.x && p.x < uPodium.z && p.z > uPodium.y && p.z < uPodium.w);
  }
`;
const RAIN = {
  vertexShader: `${COMMON}
    attribute float aEnd;
    uniform float uStreak;
    varying float vA;
    void main() {
      vec3 p = place(0.0);
      if (indoors(p)) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
      p += vec3(uWind.x, -uFall, uWind.y) * uStreak * aEnd;
      vA = (1.0 - aEnd * 0.7) * (0.45 + 0.55 * aSeed.w);
      gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
    }`,
  fragmentShader: `
    uniform float uAlpha;
    varying float vA;
    void main() { gl_FragColor = vec4(0.72, 0.78, 0.86, vA * uAlpha); }`,
};
const SNOW = {
  vertexShader: `${COMMON}
    uniform float uSize;
    varying float vA;
    void main() {
      vec3 p = place(0.9);
      if (indoors(p)) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
      vec4 mv = viewMatrix * vec4(p, 1.0);
      gl_PointSize = clamp(uSize * (0.5 + aSeed.w) / -mv.z, 1.4, 34.0);
      vA = 0.55 + 0.45 * aSeed.w;
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: `
    uniform float uAlpha;
    varying float vA;
    void main() {
      float d = length(gl_PointCoord - 0.5) * 2.0;
      gl_FragColor = vec4(vec3(1.0), smoothstep(1.0, 0.25, d) * vA * uAlpha);
    }`,
};

function precipitation(kind, count, uniforms) {
  const perVertex = kind === 'rain' ? 2 : 1;
  const seed = new Float32Array(count * perVertex * 4);
  const end = new Float32Array(count * perVertex);
  let s = 1234567;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < count; i++) {
    const v = [rnd(), rnd(), rnd(), rnd()];
    for (let j = 0; j < perVertex; j++) {
      seed.set(v, (i * perVertex + j) * 4);
      end[i * perVertex + j] = j;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * perVertex * 3), 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  if (kind === 'rain') geo.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
  const mat = new THREE.ShaderMaterial({ ...(kind === 'rain' ? RAIN : SNOW), uniforms, transparent: true, depthWrite: false });
  const o = kind === 'rain' ? new THREE.LineSegments(geo, mat) : new THREE.Points(geo, mat);
  o.frustumCulled = false;
  o.visible = false;
  o.renderOrder = 5;
  return o;
}

// Snow settles on whatever faces up, outdoors only (a floor inside the footprint stays clean).
function settleSnow(m, uniforms) {
  m.customProgramCacheKey = () => 'settle-snow';
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, uniforms);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vSnowUp;\nvarying vec3 vSnowP;')
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvSnowUp = normalize(mat3(modelMatrix) * objectNormal).y;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSnowP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vSnowUp;\nvarying vec3 vSnowP;\nuniform float uSnow;\nuniform vec4 uTower, uPodium;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        bool snowIn = (vSnowP.y < 50.6 && vSnowP.x > uTower.x && vSnowP.x < uTower.z && vSnowP.z > uTower.y && vSnowP.z < uTower.w)
          || (vSnowP.y < 4.6 && vSnowP.x > uPodium.x && vSnowP.x < uPodium.z && vSnowP.z > uPodium.y && vSnowP.z < uPodium.w);
        if (!snowIn && uSnow > 0.0) {
          float patchy = 0.5 + 0.5 * sin(vSnowP.x * 1.7 + sin(vSnowP.z * 2.3)) * sin(vSnowP.z * 1.3 + sin(vSnowP.x * 0.9));
          bool snowRoad = vSnowP.y < 0.1 && ((vSnowP.z > -38.0 && vSnowP.z < -22.2) || (vSnowP.x > -51.0 && vSnowP.x < -29.0));
          float snowTrack = abs(sin(vSnowP.z > -38.0 && vSnowP.z < -22.2 ? vSnowP.z * 0.95 : vSnowP.x * 0.95)); // wheel tracks along the road
          float snowDepth = snowRoad ? 0.42 + 0.48 * smoothstep(0.25, 0.8, snowTrack) : 0.92 + 0.08 * patchy;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 1.0, 1.02), uSnow * smoothstep(0.4, 0.8, vSnowUp) * snowDepth);
        }`);
  };
}
// Not every window is lit at night: a random pattern over storey-high cells of the facade.
// `painted`: the windows are in the facade's texture, so only its dark pixels light up.
function someWindowsLit(m, painted = false) {
  m.customProgramCacheKey = () => (painted ? 'lit-painted' : 'lit-glass');
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLitP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLitP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLitP;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        vec3 litCell = floor(vec3(vLitP.x / 3.1, vLitP.y / 3.04, vLitP.z / 3.1));
        float litKey = fract(sin(dot(litCell, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
        totalEmissiveRadiance *= litKey < 0.62 ? 0.55 + litKey : 0.0;
        ${painted ? 'totalEmissiveRadiance *= 1.0 - smoothstep(0.1, 0.3, dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11)));' : ''}`);
  };
}

// Lights across the painted skyline after dark.
function cityLights(m, uNight) {
  m.customProgramCacheKey = () => 'city-lights';
  m.onBeforeCompile = (s) => {
    s.uniforms.uNight = uNight;
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uNight;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec2 cityCell = floor(vMapUv * vec2(1500.0, 210.0));
        float cityKey = fract(sin(dot(cityCell, vec2(12.9898, 78.233))) * 43758.5453);
        if (cityKey > 0.9 && vMapUv.y > 0.12) diffuseColor.rgb += vec3(2.2, 1.6, 0.95) * uNight * (cityKey - 0.9) * 10.0;`);
  };
}
// A cloud: soft overlapping puffs with a flat, shaded base.
function cloudTexture(seed) {
  const W = 512, H = 256, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  let s = seed * 7919 + 13;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 170; i++) {
    const u = rnd(), x = W * (0.1 + u * 0.8), top = Math.sin(u * Math.PI) ** 0.7 * H * 0.5;
    const y = H * 0.7 - rnd() * top, r = (12 + rnd() * 34) * (0.6 + Math.sin(u * Math.PI) * 0.7);
    const d = g.createRadialGradient(x, y, 0, x, y, r);
    d.addColorStop(0, `rgba(255,255,255,${0.4 + rnd() * 0.45})`);
    d.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = d;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  // shaded underneath, only where there is cloud
  g.globalCompositeOperation = 'source-atop';
  const shade = g.createLinearGradient(0, H * 0.3, 0, H * 0.85);
  shade.addColorStop(0, 'rgba(150,160,180,0)');
  shade.addColorStop(1, 'rgba(170,178,196,0.42)');
  g.fillStyle = shade;
  g.fillRect(0, 0, W, H);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Low drifts of snow: against the buildings, around the trees, ploughed banks along the roads.
function snowDrifts(site) {
  const geos = [];
  let s = 4242;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const mound = (x, z, along, lenX, lenZ, height) => {
    const g = new THREE.SphereGeometry(1, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2);
    g.scale(along ? lenX : lenZ, height, along ? lenZ : lenX);
    g.translate(x, 0, z);
    geos.push(g);
  };
  const edge = (x0, z0, x1, z1, step, wide, high) => {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / step));
    for (let i = 0; i <= n; i++) {
      const t = i / n, jx = (rnd() - 0.5) * 0.35, jz = (rnd() - 0.5) * 0.35;
      mound(x0 + (x1 - x0) * t + jx, z0 + (z1 - z0) * t + jz, Math.abs(x1 - x0) > Math.abs(z1 - z0), 1.5 + rnd() * 1.3, wide * (0.6 + rnd() * 0.5), high * (0.6 + rnd() * 0.7));
    }
  };
  const rect = ([x0, z0, x1, z1]) => {
    edge(x0, z0, x1, z0, 2.5, 0.75, 0.28); edge(x0, z1, x1, z1, 2.5, 0.75, 0.28);
    edge(x0, z0, x0, z1, 2.5, 0.75, 0.28); edge(x1, z0, x1, z1, 2.5, 0.75, 0.28);
  };
  rect([-CX, -8.9 - CY, 35 - CX, 18.3 - CY]);
  for (const b of BLOCKS) b.rects.forEach(rect);
  // road banks, leaving the zebra crossing open
  for (const z of [-21.9, -38.3]) { edge(-130, z, 21.5, z, 3.2, 0.75, 0.42); edge(26, z, 145, z, 3.2, 0.75, 0.42); }
  for (const x of [-29.2, -50.8]) { edge(x, -21, x, -120, 3.2, 0.75, 0.42); edge(x, 150, x, -20, 3.2, 0.75, 0.42); }
  for (const [x, , z, r] of site.userData.trees ?? []) mound(x, z, true, 0.7 + r * 0.45, 0.7 + r * 0.45, 0.2 + rnd() * 0.12);
  const m = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshStandardMaterial({ color: 0xf6f8fc, roughness: 0.95 }));
  geos.forEach((g) => g.dispose());
  m.receiveShadow = true;
  m.visible = false;
  return m;
}

export class Atmosphere {
  // ctx: { scene, camera, orbit, canvas, sun, hemi, sunDir, baseSky, base, M, site, complex, shadowFocus, invalidate, refreshShadows }
  constructor(ctx) {
    Object.assign(this, ctx);
    this.defaultDir = this.sunDir.clone();
    this.sunVec = this.defaultDir.clone();
    this.sky = this.baseSky;
    this.hour = null; // null: the showroom's own "Day"
    this.season = 'summer';
    this.weather = 'clear';
    this.pathOn = true;
    this.studio = false;
    this.interior = false;
    this.light = this.lightFor();

    // the sun and the moon in the sky
    // (a warm ring keeps the disc readable: a bright sky around it is already near white)
    const sunTex = radial([[0, '#ffffff'], [0.16, '#fffbe8'], [0.2, '#ffc765'], [0.27, 'rgba(255,170,70,0.55)'], [0.6, 'rgba(255,150,60,0.12)'], [1, 'rgba(255,140,50,0)']]);
    const moonTex = radial([[0, '#f4f6ff'], [0.26, '#e6ebfa'], [0.3, 'rgba(190,205,255,0.22)'], [1, 'rgba(150,170,255,0)']]);
    this.sunSprite = glowSprite(sunTex, 0xffffff, 150);
    this.sunSprite.material.blending = THREE.NormalBlending;
    this.moonSprite = glowSprite(moonTex, 0xffffff, 56);
    this.dotTex = radial([[0, '#ffffff'], [0.8, '#ffffff'], [1, 'rgba(255,255,255,0)']], 64);
    this.path = new THREE.Group();
    this.scene.add(this.sunSprite, this.moonSprite, this.path);

    // street lamps: a glow on each head, a pool of light under it (shown after dark)
    const haloTex = radial([[0, 'rgba(255,226,170,1)'], [0.25, 'rgba(255,200,130,0.4)'], [1, 'rgba(255,180,100,0)']], 128);
    const poolMat = new THREE.MeshBasicMaterial({ map: haloTex, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 });
    this.lamps = new THREE.Group();
    this.poolMat = poolMat;
    const pools = [];
    const glowPoints = (spots, size) => {
      const mat = new THREE.PointsMaterial({ map: haloTex, size, sizeAttenuation: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 });
      this.lamps.add(new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(spots.flat(), 3)), mat));
      return mat;
    };
    const { lamps = [], bollards = [], trees = [] } = this.site.userData;
    for (const [x, , z] of lamps) pools.push(new THREE.PlaneGeometry(11, 11).rotateX(-Math.PI / 2).translate(x, 0.06, z));
    for (const [x, , z] of bollards) pools.push(new THREE.PlaneGeometry(4.5, 4.5).rotateX(-Math.PI / 2).translate(x, 0.06, z));
    if (pools.length) this.lamps.add(new THREE.Mesh(mergeGeometries(pools), poolMat));
    // fairy lights in the round trees
    const fairy = [];
    let fs = 99;
    const frnd = () => ((fs = (fs * 16807) % 2147483647) / 2147483647);
    for (const [x, y, z, r] of trees) for (let i = 0; i < 34; i++) {
      const a = frnd() * Math.PI * 2, u = frnd() * 1.5 - 0.6, c = Math.sqrt(Math.max(0, 1 - u * u));
      fairy.push([x + Math.cos(a) * c * r * 1.02, y + u * r * 1.02, z + Math.sin(a) * c * r * 1.02]);
    }
    this.lampGlows = [glowPoints(lamps, 2.6), glowPoints(bollards, 1.1), glowPoints(fairy, 0.3)];
    this.lamps.visible = false;
    this.scene.add(this.lamps);
    // the far ground and the painted skyline dim with the sky; the ground goes white under snow
    const backdrop = this.site.getObjectByName('backdrop');
    this.backdropMat = backdrop.material;
    this.farGround = backdrop.parent.children.find((o) => o !== backdrop).material;
    this.farGroundColor = this.farGround.color.clone();
    this.uNight = { value: 0 };
    cityLights(this.backdropMat, this.uNight);
    // clouds drifting over the neighbourhood
    this.cloudMats = [1, 2, 3].map((v) => new THREE.SpriteMaterial({ map: cloudTexture(v), transparent: true, depthWrite: false, fog: false }));
    for (const m of this.cloudMats) { m.color.setRGB(...this.light.cloud).multiplyScalar(8); m.opacity = 0.92; }
    this.clouds = new THREE.Group();
    let cs = 777;
    const crnd = () => ((cs = (cs * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 34; i++) {
      const a = crnd() * Math.PI * 2, r = 220 + crnd() * 760, w = 170 + crnd() * 300;
      const cloud = new THREE.Sprite(this.cloudMats[i % 3]);
      cloud.position.set(CENTER.x + Math.cos(a) * r, 150 + crnd() * 190, CENTER.z + Math.sin(a) * r);
      cloud.scale.set(w, w * (0.34 + crnd() * 0.16), 1);
      cloud.renderOrder = -1;
      this.clouds.add(cloud);
    }
    this.scene.add(this.clouds);
    this.drifts = snowDrifts(this.site);
    this.scene.add(this.drifts);
    this.snowLevel = 0;
    this.lastTick = 0;

    // what glows after dark: windows, shop fronts, lamp heads
    this.glowing = [];
    for (const root of [this.site, this.complex]) root.traverse((o) => {
      const m = o.material;
      if (m?.emissive && m.emissiveIntensity > 0 && m.emissive.getHex() !== 0 && !this.glowing.some((g) => g.m === m)) this.glowing.push({ m, base: m.emissiveIntensity });
    });
    this.windows = [this.M.glass];
    for (const root of [this.complex, this.site]) root.traverse((o) => { const m = o.material; if ((m?.name === 'windowGlass' || m?.name === 'facade') && !this.windows.includes(m)) this.windows.push(m); });
    for (const m of this.windows) { m.emissive = new THREE.Color(0xffc488); m.emissiveIntensity = 0; someWindowsLit(m, m.name === 'facade'); }

    // the ground takes snow or a wet sheen
    this.surfaces = [];
    this.site.traverse((o) => {
      const m = o.material;
      if (m?.isMeshStandardMaterial && !this.surfaces.some((g) => g.m === m)) this.surfaces.push({ m, color: m.color.clone(), rough: m.roughness });
    });

    // particles
    const tower = [-0.2 - CX, 0 - CY, 35.2 - CX, 18.4 - CY], podium = [-0.2 - CX, -8.9 - CY, 35.2 - CX, 18.4 - CY];
    const shared = () => ({ uTime: { value: 0 }, uFall: { value: 0 }, uCam: { value: new THREE.Vector3() }, uBox: { value: new THREE.Vector3(170, 90, 170) }, uWind: { value: new THREE.Vector2() }, uTower: { value: new THREE.Vector4(...tower) }, uPodium: { value: new THREE.Vector4(...podium) }, uAlpha: { value: 1 } });
    this.rainU = { ...shared(), uStreak: { value: 0.11 } };
    this.snowU = { ...shared(), uSize: { value: 90 } };
    this.rainU.uFall.value = 11; this.rainU.uWind.value.set(1.4, 0.8); this.rainU.uAlpha.value = 0.42;
    this.snowU.uFall.value = 1.3; this.snowU.uWind.value.set(0.35, 0.2); this.snowU.uAlpha.value = 0.95;
    this.COUNT = { rain: 26000, snow: 30000 };
    this.rain = precipitation('rain', this.COUNT.rain, this.rainU);
    this.snow = precipitation('snow', this.COUNT.snow, this.snowU);
    this.scene.add(this.rain, this.snow);

    // snow settling on the building and everything around it
    this.snowCover = { value: 0 };
    const seen = new Set(this.windows);
    for (const root of [this.buildingRoot, this.site, this.complex]) root.traverse((o) => {
      const m = o.material;
      if (!m?.isMeshStandardMaterial || m.transparent || seen.has(m)) return;
      seen.add(m);
      settleSnow(m, { uSnow: this.snowCover, uTower: this.rainU.uTower, uPodium: this.rainU.uPodium });
    });
  }

  // where to look to see the sun (or, after dark, the moon)
  get skyBody() {
    const s = this.hour === null ? { dir: this.defaultDir, alt: 35 } : sunAt(this.hour, this.season);
    return s.alt > -1 ? s.dir : MOON;
  }

  get animating() { return this.weather !== 'clear' && !this.studio && !document.body.dataset.pano; }


  lightFor() {
    const alt = this.hour === null ? 35 : sunAt(this.hour, this.season).alt;
    const L = keyAt(alt);
    L.alt = alt;
    if (this.weather !== 'clear') {
      // overcast: the sky goes grey at the brightness of the hour, the sun all but disappears
      const lum = L.ground, g = (this.weather === 'snow' ? 0.82 : 0.5) * lum + 0.012;
      L.zen = [g * 0.92, g * 0.96, g * 1.04];
      L.hor = [g * 1.05, g * 1.07, g * 1.1];
      L.cloud = [g * 1.1, g * 1.12, g * 1.15];
      L.glow = [0, 0, 0];
      L.sun *= this.weather === 'snow' ? 0.16 : 0.1;
      L.hemi += (this.weather === 'snow' ? 0.45 : 0.2) * lum;
      L.exp += this.weather === 'snow' ? 0.06 : 0.08;
    }
    return L;
  }

  // full: final quality; a slider being dragged uses a small sky
  update({ full = true } = {}) {
    const L = this.light = this.lightFor();
    const showroom = this.hour === null && this.weather === 'clear';
    const s = this.hour === null ? { dir: this.defaultDir, alt: 35 } : sunAt(this.hour, this.season);
    const moonlit = s.alt < -1;
    this.sunDir.copy(moonlit ? MOON : s.dir);
    if (this.sky !== this.baseSky) this.sky.dispose();
    this.sky = showroom ? this.baseSky : makeSky(moonlit ? MOON : s.dir, full ? 1024 : 384, full ? 512 : 192, { zenith: L.zen, horizon: L.hor, glow: moonlit ? [0, 0, 0] : L.glow, cloud: L.cloud, ground: L.ground });

    // sun and moon in the sky, the day's path behind them
    const overcast = this.weather !== 'clear', sky = !this.studio;
    this.sunSprite.visible = sky && !overcast && s.alt > -1;
    this.sunVec = s.dir.clone();
    this.sunSprite.position.copy(this.camera.position).addScaledVector(this.sunVec, R);
    this.moonSprite.position.copy(this.camera.position).addScaledVector(MOON, R);
    this.sunSprite.material.color.setRGB(...L.col).multiplyScalar(2.2);
    this.moonSprite.visible = sky && L.night > 0.3 && !overcast;
    // (under rain or snow the whole sky is cloud)
    this.clouds.visible = sky && !overcast;
    for (const m of this.cloudMats) {
      m.color.setRGB(...L.cloud).multiplyScalar(8);
      m.opacity = 0.92 - L.night * 0.45;
    }
    this.path.visible = sky && this.pathOn && this.hour !== null;
    if (this.path.visible && this.pathSeason !== this.season) this.buildPath();

    // after dark
    const n = L.night;
    for (const m of this.windows) m.emissiveIntensity = (m.name === 'facade' ? 1.5 : 1.1) * n;
    this.uNight.value = n;
    const far = Math.max(0.05, Math.min(1, L.ground * 1.05));
    this.backdropMat.color.setScalar(far);
    this.farGround.color.copy(this.weather === 'snow' ? new THREE.Color(0xf0f2f6) : this.farGroundColor).multiplyScalar(far);
    for (const { m, base } of this.glowing) m.emissiveIntensity = base + n * 1.6;
    this.lamps.visible = sky && n > 0.05;
    this.poolMat.opacity = 0.24 * n;
    for (const m of this.lampGlows) m.opacity = n;

    // the ground
    for (const { m, color, rough } of this.surfaces) {
      m.color.copy(color);
      m.roughness = rough;
      if (this.weather === 'rain') { m.color.multiplyScalar(0.72); m.roughness = rough * 0.45; }
    }
    this.rain.visible = sky && this.weather === 'rain';
    this.snow.visible = sky && this.weather === 'snow';
    this.apply();
    this.shadowFocus();
    this.refreshShadows();
  }

  // lights and exposure for the current state; the dollhouse's dark studio always has the showroom's own light
  apply() {
    const { base, hemi, sun, renderer, scene } = this;
    const L = this.studio ? { env: base.env, hemi: base.hemi, sun: base.sun, exp: base.exposure, col: [1, 0.9, 0.78], night: 0 } : this.light;
    scene.environment = this.studio ? this.baseSky : this.sky;
    if (!this.studio) scene.background = this.sky;
    const moon = L.night * 0.9;
    const power = L.sun + (this.sunDir.equals(MOON) ? moon : 0);
    // a dimmed floor plan would be unreadable: after dark the open floor keeps some working light
    const cutaway = document.body.dataset.mode === 'floor' ? L.night * 0.9 : 0;
    if (this.interior) {
      hemi.intensity = 0.4 * Math.max(0.35, L.hemi / base.hemi);
      scene.environmentIntensity = 0.6 * (L.env / base.env);
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1;
      sun.intensity = 2.5 * (power / base.sun);
    } else {
      hemi.intensity = L.hemi + cutaway;
      scene.environmentIntensity = L.env;
      renderer.toneMapping = base.toneMapping;
      renderer.toneMappingExposure = L.exp;
      sun.intensity = power;
    }
    if (this.sunDir.equals(MOON)) sun.color.setRGB(0.62, 0.72, 1); else if (this.hour === null && this.weather === 'clear') sun.color.set(0xffe6c7); else sun.color.setRGB(...L.col);
    this.invalidate();
  }

  setStudio(on) {
    this.studio = on;
    this.sunSprite.visible = this.moonSprite.visible = this.path.visible = this.lamps.visible = this.rain.visible = this.snow.visible = this.drifts.visible = this.clouds.visible = false;
    if (!on) return this.update();
    this.snowCover.value = 0;
    this.sunDir.copy(this.defaultDir);
    this.apply();
    this.shadowFocus();
  }

  buildPath() {
    this.path.clear();
    this.pathSeason = this.season;
    const pts = [];
    for (let h = 0; h <= 24; h += 0.1) {
      const s = sunAt(h, this.season);
      if (s.alt > 0) pts.push(s.dir.multiplyScalar(R).add(CENTER));
    }
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xff8a2a, depthWrite: false, fog: false }));
    this.path.add(line);
    for (let h = 4; h <= 20; h += 2) {
      const s = sunAt(h, this.season);
      if (s.alt < 1) continue;
      const p = s.dir.clone().multiplyScalar(R).add(CENTER);
      const l = hourLabel(`${String(h).padStart(2, '0')}:00`);
      l.position.copy(p).add(new THREE.Vector3(0, 16, 0));
      const dot = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.dotTex, color: 0xff8a2a, transparent: true, depthWrite: false, fog: false }));
      dot.scale.setScalar(8);
      dot.position.copy(p);
      this.path.add(l, dot);
    }
  }

  // every frame: the sky follows the camera, and so do the particles
  tick(now) {
    // the sky's bodies are infinitely far: they keep their direction wherever the camera stands, on top of the sky's glow
    const at = this.camera.position;
    if (this.sunVec) this.sunSprite.position.copy(at).addScaledVector(this.sunVec, R);
    this.moonSprite.position.copy(at).addScaledVector(MOON, R);
    this.path.position.copy(at).sub(CENTER);
    // snow builds up over a few seconds and is gone the moment the weather changes
    const dt = Math.min(0.1, (now - this.lastTick) / 1000);
    this.lastTick = now;
    // (a gentle drift; it wraps around the neighbourhood)
    for (const c of this.clouds.children) { c.position.x += dt * 1.6; if (c.position.x > CENTER.x + 1000) c.position.x -= 2000; }
    this.snowLevel = this.weather === 'snow' ? Math.min(1, this.snowLevel + dt / 5) : 0;
    this.snowCover.value = this.studio ? 0 : this.snowLevel;
    this.drifts.visible = !this.studio && this.snowLevel > 0;
    this.drifts.scale.y = Math.max(0.001, this.snowLevel);
    if (!this.animating) return;
    const u = this.weather === 'rain' ? this.rainU : this.snowU, o = this.weather === 'rain' ? this.rain : this.snow;
    const dist = this.camera.position.distanceTo(this.orbit.target);
    const size = dist < 30 ? 44 : dist < 110 ? 100 : 170; // the box the weather falls in: tighter close up
    u.uBox.value.set(size, Math.min(size, 90), size);
    const fwd = this.camera.getWorldDirection(new THREE.Vector3());
    u.uCam.value.copy(this.camera.position).addScaledVector(fwd, size * 0.35);
    u.uTime.value = now / 1000;
    if (this.weather === 'snow') u.uSize.value = 90 * (this.renderer.domElement.height / 900);
    o.geometry.setDrawRange(0, Math.round(this.COUNT[this.weather] * (size === 170 ? 1 : size === 100 ? 0.7 : 0.35)) * (this.weather === 'rain' ? 2 : 1));
  }

  // ---------- controls ----------
  bindUI($) {
    const label = $('#sky-time'), slider = $('#sky-hour');
    const times = {
      day: () => null,
      sunrise: () => hourAtAltitude(4, false, this.season),
      noon: () => 12,
      sunset: () => hourAtAltitude(4, true, this.season),
      night: () => 23,
    };
    const fmt = (h) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;
    const refresh = (preset) => {
      this.preset = preset;
      for (const b of document.querySelectorAll('#sky-presets button')) b.classList.toggle('on', b.dataset.t === preset);
      for (const b of document.querySelectorAll('#sky-weather button')) b.classList.toggle('on', b.dataset.w === this.weather);
      for (const b of document.querySelectorAll('#sky-season button')) b.classList.toggle('on', b.dataset.s === this.season);
      if (this.hour !== null) slider.value = Math.min(23, Math.max(4, this.hour));
      label.textContent = this.hour === null ? 'Showroom light' : `${fmt(this.hour)} · ${this.season === 'summer' ? 'June' : 'December'}${sunAt(this.hour, this.season).alt < 0 ? ' · sun below the horizon' : ''}`;
      $('#sky-path').disabled = this.hour === null;
    };
    for (const b of document.querySelectorAll('#sky-presets button')) b.onclick = () => { this.hour = times[b.dataset.t](); refresh(b.dataset.t); this.update(); };
    for (const b of document.querySelectorAll('#sky-weather button')) b.onclick = () => {
      this.weather = b.dataset.w;
      if (this.weather === 'snow') this.setSeason('winter', times);
      refresh(this.preset);
      this.update();
    };
    for (const b of document.querySelectorAll('#sky-season button')) b.onclick = () => { this.setSeason(b.dataset.s, times); refresh(this.preset); this.update(); };
    // dragging: small sky, at most once a frame; on release, the final one
    let pending = false;
    slider.oninput = () => {
      this.hour = +slider.value;
      refresh(null);
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => { pending = false; this.update({ full: false }); });
    };
    slider.onchange = () => this.update();
    $('#sky-see').onclick = () => this.onSeeSun?.();
    $('#sky-path').onclick = (e) => { this.pathOn = !this.pathOn; e.currentTarget.classList.toggle('on', this.pathOn); this.update(); };
    $('#sky-toggle').onclick = () => $('#sky').classList.toggle('open');
    if (innerWidth < 760) $('#sky').classList.remove('open'); // on a phone it starts folded away
    refresh('day');
  }
  // a named time keeps its meaning across seasons (the sun sets at a different hour)
  setSeason(season, times) {
    this.season = season;
    if (this.preset && this.hour !== null) this.hour = times[this.preset]();
  }
}
