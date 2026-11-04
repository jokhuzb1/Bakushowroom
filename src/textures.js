// Procedural, seamlessly tiling PBR textures generated on the client (color + roughness + normal).
// No downloads: every surface is synthesized from noise so the demo is self-contained.
import * as THREE from 'three';

function hash2(x, y, s) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(s, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// Value noise that tiles with period (px, py) in lattice units.
function vnoise(x, y, px, py, s) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const x0 = ((ix % px) + px) % px, x1 = (x0 + 1) % px;
  const y0 = ((iy % py) + py) % py, y1 = (y0 + 1) % py;
  const a = hash2(x0, y0, s), b = hash2(x1, y0, s), c = hash2(x0, y1, s), d = hash2(x1, y1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

// Fractal noise over u,v in [0,1), tiling; fx/fy are integer base frequencies.
export function fbm(u, v, fx, fy, oct = 4, s = 0) {
  let sum = 0, amp = 0.5, norm = 0, f = 1;
  for (let i = 0; i < oct; i++) {
    sum += amp * vnoise(u * fx * f, v * fy * f, fx * f, fy * f, s + i * 17);
    norm += amp; amp *= 0.5; f *= 2;
  }
  return sum / norm;
}

export function rand(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;

// Runs `fn(u, v)` per pixel. fn returns [r, g, b, height, roughness] (color in sRGB 0..1).
function generate(size, fn, { normalStrength = 2, world = 1 } = {}) {
  const n = size * size;
  const col = new Uint8ClampedArray(n * 4);
  const rough = new Uint8ClampedArray(n * 4);
  const height = new Float32Array(n);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const [r, g, b, h, ro] = fn(x / size, v);
      col[i * 4] = r * 255; col[i * 4 + 1] = g * 255; col[i * 4 + 2] = b * 255; col[i * 4 + 3] = 255;
      const rv = ro * 255;
      rough[i * 4] = rv; rough[i * 4 + 1] = rv; rough[i * 4 + 2] = rv; rough[i * 4 + 3] = 255;
      height[i] = h;
    }
  }
  const nor = new Uint8ClampedArray(n * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const l = height[y * size + ((x - 1 + size) % size)], r = height[y * size + ((x + 1) % size)];
      const t = height[((y - 1 + size) % size) * size + x], b = height[((y + 1) % size) * size + x];
      let nx = (l - r) * normalStrength, ny = (b - t) * normalStrength, nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len; ny /= len; nz /= len;
      const i = (y * size + x) * 4;
      nor[i] = (nx * 0.5 + 0.5) * 255; nor[i + 1] = (ny * 0.5 + 0.5) * 255; nor[i + 2] = (nz * 0.5 + 0.5) * 255; nor[i + 3] = 255;
    }
  }
  const mk = (data, srgb) => {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    c.getContext('2d').putImageData(new ImageData(data, size, size), 0, 0);
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    tex.anisotropy = 16;
    tex.userData.world = world; // meters covered by one repeat
    return tex;
  };
  return { map: mk(col, true), roughnessMap: mk(rough, false), normalMap: mk(nor, false), world };
}

// ---------- individual surfaces ----------

function planks({ size, world, plankW, color, seed, seams = 2, bevel = 0.004 }) {
  const rows = Math.round(world / plankW);
  const R = rand(seed);
  const rowData = [];
  for (let r = 0; r < rows; r++) {
    const cuts = [];
    for (let k = 0; k < seams; k++) cuts.push(R());
    cuts.sort();
    const tones = cuts.map(() => [0.9 + R() * 0.14, R() * 50, R()]);
    rowData.push({ cuts, tones });
  }
  return generate(size, (u, v) => {
    const row = Math.min(rows - 1, Math.floor(v * rows));
    const ly = v * rows - row;
    const { cuts, tones } = rowData[row];
    let k = cuts.length - 1, distSeam = 1;
    for (let j = 0; j < cuts.length; j++) {
      if (u >= cuts[j]) k = j;
      const d = Math.abs(u - cuts[j]);
      distSeam = Math.min(distSeam, d, 1 - d);
    }
    const [tone, off, hue] = tones[k];
    const lines = fbm(u + off * 0.013, v, 3, rows * 26, 3, seed + 5);
    const rings = 0.5 + 0.5 * Math.sin((ly * 9 + fbm(u + off * 0.01, v, 4, rows * 2, 3, seed + 9) * 7) * Math.PI * 2);
    const fine = fbm(u, v, 40, rows * 90, 2, seed + 13);
    let shade = tone * (0.8 + 0.28 * lines) * (0.93 + 0.08 * rings) * (0.95 + 0.08 * fine);
    const edgeY = Math.min(ly, 1 - ly) * world / rows; // meters to long edge
    const edgeX = distSeam * world;
    const e = Math.min(edgeX, edgeY);
    const gap = smooth(0.0, bevel, e);
    shade *= mix(0.45, 1, gap);
    const warm = (hue - 0.5) * 0.04;
    return [
      clamp01(color[0] * shade + warm), clamp01(color[1] * shade), clamp01(color[2] * shade - warm),
      gap * 0.6 + lines * 0.25 + fine * 0.15,
      mix(0.85, 0.42 + lines * 0.18, gap),
    ];
  }, { normalStrength: 3, world });
}

function tiles({ size, world, cols, rows, color, grout, groutW, rough, seed, veins = 0, cloud = 0.12 }) {
  const R = rand(seed);
  const tone = Array.from({ length: cols * rows }, () => 0.96 + R() * 0.07);
  return generate(size, (u, v) => {
    const cx = Math.floor(u * cols), cy = Math.floor(v * rows);
    const lx = (u * cols - cx) * world / cols, ly = (v * rows - cy) * world / rows;
    const w = world / cols, h = world / rows;
    const e = Math.min(lx, w - lx, ly, h - ly);
    const g = smooth(groutW * 0.5, groutW * 0.5 + 0.0015, e);
    const t = tone[cy * cols + cx];
    const n = fbm(u, v, 6, 6, 5, seed);
    let s = t * (1 - cloud + cloud * 2 * n);
    if (veins) {
      const vn = fbm(u, v, 3, 3, 5, seed + 3);
      const vein = 1 - smooth(0, 0.05, Math.abs(Math.sin((u * 2 + v + vn * 2.5) * Math.PI * 2)));
      s *= 1 - vein * veins;
    }
    const speck = fbm(u, v, 120, 120, 1, seed + 7) > 0.8 ? 0.94 : 1;
    s *= speck;
    return [
      mix(grout[0], clamp01(color[0] * s), g), mix(grout[1], clamp01(color[1] * s), g), mix(grout[2], clamp01(color[2] * s), g),
      g * 0.8 + n * 0.05,
      mix(0.9, rough, g),
    ];
  }, { normalStrength: 2.5, world });
}

function marble({ size, world, seed }) {
  return generate(size, (u, v) => {
    const n = fbm(u, v, 3, 3, 6, seed);
    const n2 = fbm(u, v, 8, 8, 4, seed + 4);
    const a = Math.abs(Math.sin((u * 2 + v * 1 + n * 3.2) * Math.PI * 2));
    const b = Math.abs(Math.sin((u * 1 - v * 2 + n2 * 2.0) * Math.PI * 2));
    const vein = (1 - smooth(0, 0.06, a)) * 0.75 + (1 - smooth(0, 0.025, b)) * 0.3;
    const base = 0.9 + 0.06 * n2;
    const s = base * (1 - vein * 0.45);
    return [s * 0.97, s * 0.965, s * 0.955, 0.5, 0.12 + vein * 0.06];
  }, { normalStrength: 0.4, world });
}

function fabric({ size, world, threads, slub = 0.12, seed }) {
  return generate(size, (u, v) => {
    const a = Math.sin(u * threads * Math.PI * 2);
    const b = Math.sin(v * threads * Math.PI * 2);
    const over = (Math.floor(u * threads) + Math.floor(v * threads)) % 2 === 0;
    const weave = over ? 0.5 + 0.5 * Math.abs(b) : 0.5 + 0.5 * Math.abs(a);
    const sl = fbm(u, v, 4, threads / 4, 3, seed);
    const s = 0.86 + 0.1 * weave + slub * (sl - 0.5);
    return [s, s, s * 0.99, weave * 0.6 + sl * 0.4, 0.88];
  }, { normalStrength: 4, world });
}

function plaster({ size, world, seed }) {
  return generate(size, (u, v) => {
    const n = fbm(u, v, 8, 8, 5, seed);
    const s = 0.975 + 0.04 * n;
    return [s, s, s, n, 0.9];
  }, { normalStrength: 1.2, world });
}

function woodGrain({ size, world, color, seed }) {
  return generate(size, (u, v) => {
    const lines = fbm(u, v, 3, 60, 3, seed);
    const rings = 0.5 + 0.5 * Math.sin((v * 14 + fbm(u, v, 4, 3, 3, seed + 2) * 5) * Math.PI * 2);
    const s = (0.82 + 0.25 * lines) * (0.92 + 0.1 * rings);
    return [clamp01(color[0] * s), clamp01(color[1] * s), clamp01(color[2] * s), lines, 0.5 + lines * 0.15];
  }, { normalStrength: 1, world });
}

function concrete({ size, world, seed }) {
  return generate(size, (u, v) => {
    const n = fbm(u, v, 6, 6, 6, seed);
    const p = fbm(u, v, 64, 64, 2, seed + 1);
    const s = 0.68 + 0.14 * n - (p > 0.78 ? 0.08 : 0);
    return [s, s * 0.99, s * 0.97, n * 0.5 + p * 0.5, 0.85];
  }, { normalStrength: 1.5, world });
}

function rug({ size, seed }) {
  return generate(size, (u, v) => {
    const wool = fbm(u, v, 160, 160, 2, seed);
    const tuft = fbm(u, v, 24, 24, 3, seed + 1);
    const d = Math.min(u, 1 - u, v, 1 - v);
    const band = (d > 0.045 && d < 0.06) || (d > 0.075 && d < 0.082);
    const base = 0.9 + 0.08 * wool + 0.04 * (tuft - 0.5);
    const c = band ? [0.32, 0.3, 0.28] : [0.93, 0.9, 0.85];
    return [c[0] * base, c[1] * base, c[2] * base, wool, 0.95];
  }, { normalStrength: 3, world: 1 });
}

// Scanned PBR sets from Poly Haven (CC0) in public/textures/ph: id -> meters covered by one repeat.
export const PH_TEXTURES = {
  beige_wall_001: 2.0, oak_veneer_01: 1.2, natural_walnut_veneer: 1.2, hessian_230: 0.6,
  laminate_floor_02: 2.4, interior_tiles: 1.2, long_white_tiles: 1.2, painted_plaster_wall: 2.0,
};
export async function loadScannedTextures() {
  const loader = new THREE.TextureLoader();
  const out = {};
  await Promise.all(Object.entries(PH_TEXTURES).map(async ([id, world]) => {
    const set = { world };
    await Promise.all([['map', 'diff', true], ['roughnessMap', 'rough', false], ['normalMap', 'nor', false]].map(async ([k, f, srgb]) => {
      try {
        const t = await loader.loadAsync(`/textures/ph/${id}_${f}.webp`);
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        t.anisotropy = 8;
        t.userData.world = world;
        set[k] = t;
      } catch { /* missing map: material falls back to flat values */ }
    }));
    out[id] = set;
  }));
  return out;
}

// Loads the textures baked to public/textures (see bake.html); falls back to generating them.
export async function loadTextures() {
  let manifest;
  try {
    const r = await fetch('/textures/manifest.json');
    if (!r.ok) throw new Error();
    manifest = await r.json();
  } catch {
    return generateTextures();
  }
  const loader = new THREE.TextureLoader();
  const kinds = { map: true, roughnessMap: false, normalMap: false };
  const out = {};
  await Promise.all(Object.entries(manifest).map(async ([name, world]) => {
    const entry = { world };
    await Promise.all(Object.entries(kinds).map(async ([kind, srgb]) => {
      const tex = await loader.loadAsync(`/textures/${name}_${kind}.webp`);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      tex.anisotropy = 8;
      tex.userData.world = world;
      entry[kind] = tex;
    }));
    out[name] = entry;
  }));
  return out;
}

// Generates every texture the scene needs, yielding between them so a progress bar can update.
export async function generateTextures(onProgress) {
  const jobs = {
    oak: () => planks({ size: 1024, world: 2.4, plankW: 0.2, color: [0.78, 0.6, 0.42], seed: 11, seams: 1 }),
    deck: () => planks({ size: 512, world: 1.26, plankW: 0.14, color: [0.52, 0.47, 0.42], seed: 21, seams: 1, bevel: 0.006 }),
    stone: () => tiles({ size: 1024, world: 1.2, cols: 2, rows: 2, color: [0.76, 0.73, 0.69], grout: [0.58, 0.56, 0.53], groutW: 0.003, rough: 0.5, seed: 31 }),
    wallTile: () => tiles({ size: 1024, world: 1.2, cols: 4, rows: 2, color: [0.95, 0.95, 0.93], grout: [0.82, 0.81, 0.79], groutW: 0.0025, rough: 0.12, seed: 41, cloud: 0.03 }),
    marble: () => marble({ size: 1024, world: 1.4, seed: 51 }),
    fabric: () => fabric({ size: 512, world: 0.25, threads: 96, seed: 61 }),
    linen: () => fabric({ size: 512, world: 0.4, threads: 110, slub: 0.22, seed: 71 }),
    plaster: () => plaster({ size: 512, world: 2.5, seed: 81 }),
    oakWood: () => woodGrain({ size: 512, world: 1.0, color: [0.78, 0.62, 0.45], seed: 91 }),
    walnut: () => woodGrain({ size: 512, world: 1.0, color: [0.42, 0.29, 0.2], seed: 101 }),
    concrete: () => concrete({ size: 512, world: 2.0, seed: 111 }),
    rug: () => rug({ size: 1024, seed: 121 }),
  };
  const out = {};
  const keys = Object.keys(jobs);
  for (let i = 0; i < keys.length; i++) {
    onProgress?.(i / keys.length, keys[i]);
    await new Promise((r) => setTimeout(r, 0));
    out[keys[i]] = jobs[keys[i]]();
  }
  onProgress?.(1);
  return out;
}

// Equirectangular HDR sky (no sun disk - the sun is a separate DirectionalLight so both
// the rasterizer and the path tracer see the same single sun).
export function makeSky(sunDir, width = 1024, height = 512, { zenith = [0.34, 0.5, 0.82], horizon = [1.0, 0.99, 0.98] } = {}) {
  const data = new Float32Array(width * height * 4);
  const s = sunDir.clone().normalize();
  // matches three.js equirect lookup: u = atan2(z, x) / 2PI + 0.5, v = asin(y) / PI + 0.5, row 0 = bottom
  for (let y = 0; y < height; y++) {
    const elev = ((y + 0.5) / height - 0.5) * Math.PI;
    const dy = Math.sin(elev), ce = Math.cos(elev);
    for (let x = 0; x < width; x++) {
      const az = ((x + 0.5) / width - 0.5) * Math.PI * 2;
      const dx = ce * Math.cos(az), dz = ce * Math.sin(az);
      const cosSun = Math.max(0, dx * s.x + dy * s.y + dz * s.z);
      let r, g, b;
      if (dy >= 0) {
        const t = Math.pow(1 - dy, 3);
        r = mix(zenith[0], horizon[0], t); g = mix(zenith[1], horizon[1], t); b = mix(zenith[2], horizon[2], t);
        const glow = Math.pow(cosSun, 8) * 1.2 + Math.pow(cosSun, 64) * 4;
        r += glow * 1.0; g += glow * 0.85; b += glow * 0.6;
        const cl = fbm(x / width, y / height, 8, 4, 5, 7);
        const cloud = smooth(0.55, 0.75, cl) * smooth(0.0, 0.25, dy) * 0.6;
        r = mix(r, 1.25, cloud); g = mix(g, 1.25, cloud); b = mix(b, 1.25, cloud);
      } else {
        // ground: hazy city / park tones fading to horizon
        const t = Math.pow(1 + dy, 6);
        const n = fbm(x / width, y / height, 64, 16, 3, 3);
        r = mix(0.27 + 0.05 * n, 0.9, t); g = mix(0.255 + 0.05 * n, 0.9, t); b = mix(0.235 + 0.04 * n, 0.9, t);
      }
      const i = (y * width + x) * 4;
      const k = 2.6;
      data[i] = r * k; data[i + 1] = g * k; data[i + 2] = b * k; data[i + 3] = 1;
    }
  }
  const tex = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.FloatType);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.LinearSRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}
