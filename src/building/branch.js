// Floor 1's commercial hall (АР-8, 524 m²) fitted out as one modern customer branch: a glazed entrance gallery on
// the street, the service hall with private consultation rooms between the structural fins, a welcome desk and media
// wall in the centre, a business lounge with café and meeting rooms, a 24/7 self-service gallery and a boardroom.
// The hall is shown at its real size on the drawn walls (show-flat enlargement would only make it emptier).
//
// The brand is one entry, BRANCH: the building's own name stands in until there is a tenant. Change it and
// re-render the tour (`/pano-bake.html?units=f1-branch`, then `--variants f1-branch`).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { box as gbox, cyl, mesh } from '../geo.js';
import { model, loadModels } from './models.js';
import * as ST from '../styles/warmMinimal.js';
import { fbm } from '../textures.js';
import { CX, CY } from './model.js';

export const BRANCH = { name: 'BAKU CITY', line: 'Business', tagline: 'Service · Lounge · Meeting rooms', primary: '#0f4c52', deep: '#08292e', accent: '#d2b277', text: '#f5f2ea' };
const IDS = ['ht_chair', 'ht_coffee_table', 'ht_floor_lamp'];
export const loadBranchModels = async (K) => Object.assign(K.lib, await loadModels(null, IDS));

const CEIL = 4.0; // m, suspended ceiling under the 4.52 m slab
const X = (x) => x - CX, Z = (y) => y - CY;
const std = (p) => new THREE.MeshStandardMaterial(p);
const FACE = { south: 0, north: Math.PI, east: Math.PI / 2, west: -Math.PI / 2 };

// ---------- graphics ----------
function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
const SANS = '"Segoe UI", Arial, sans-serif';
// the mark: an open ring with a dot, drawn wherever the name appears
function mark(g, x, y, r, color) {
  g.strokeStyle = g.fillStyle = color;
  g.lineWidth = r * 0.2;
  g.beginPath();
  g.arc(x, y, r, Math.PI * 0.2, Math.PI * 1.75);
  g.stroke();
  g.beginPath();
  g.arc(x, y, r * 0.3, 0, Math.PI * 2);
  g.fill();
}
function signTex(line = BRANCH.line, { bg = BRANCH.primary, fg = BRANCH.text } = {}) {
  return canvasTex(1536, 288, (g, w, h) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    mark(g, 150, h / 2, 74, BRANCH.accent);
    g.fillStyle = fg;
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    g.letterSpacing = '16px';
    g.font = `600 112px ${SANS}`;
    g.fillText(BRANCH.name, 268, h / 2 - (line ? 38 : 0));
    if (line) {
      g.fillStyle = BRANCH.accent;
      g.letterSpacing = '12px';
      g.font = `400 58px ${SANS}`;
      g.fillText(line.toUpperCase(), 272, h / 2 + 62);
    }
  });
}
function queueTex() {
  return canvasTex(1024, 300, (g, w, h) => {
    g.fillStyle = '#071417';
    g.fillRect(0, 0, w, h);
    g.textBaseline = 'middle';
    g.fillStyle = BRANCH.accent;
    g.font = `500 44px ${SANS}`;
    g.fillText('NOW SERVING', 44, 56);
    [['A 024', 1], ['B 107', 2], ['A 025', 3], ['C 012', 4]].forEach(([t, d], i) => {
      const x = 44 + i * 240;
      g.fillStyle = BRANCH.text;
      g.font = `600 72px ${SANS}`;
      g.fillText(t, x, 150);
      g.fillStyle = '#7fb9bd';
      g.font = `400 38px ${SANS}`;
      g.fillText(`Desk ${d}`, x, 232);
    });
  });
}
// a calm dashboard for desk and kiosk screens
function screenTex(title = '') {
  return canvasTex(512, 320, (g, w, h) => {
    const bg = g.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, '#0d3a40');
    bg.addColorStop(1, '#071a1e');
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    mark(g, 46, 44, 18, BRANCH.accent);
    g.fillStyle = BRANCH.text;
    g.textBaseline = 'middle';
    g.font = `500 28px ${SANS}`;
    g.fillText(title || BRANCH.name, 80, 46);
    g.fillStyle = 'rgba(245,242,234,0.16)';
    for (let i = 0; i < 3; i++) g.fillRect(34, 104 + i * 66, w - 68, 50);
    g.fillStyle = BRANCH.accent;
    g.fillRect(34, 104, (w - 68) * 0.62, 50);
  });
}
function mediaTex(w0 = 1024, h0 = 1024) {
  return canvasTex(w0, h0, (g, w, h) => {
    const k = h / 1024;
    const bg = g.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#0a2f35');
    bg.addColorStop(0.62, '#14666c');
    bg.addColorStop(0.86, '#d2b277');
    bg.addColorStop(1, '#f0d9a8');
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    // a skyline of towers against the evening
    let s = 77;
    const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    for (const [col, base, tall] of [['rgba(8,41,46,0.45)', 900 * k, 300 * k], ['rgba(6,28,32,0.9)', 1024 * k, 240 * k]]) {
      g.fillStyle = col;
      for (let x = -20; x < w;) {
        const bw = (44 + rnd() * 74) * k, bh = tall * (0.35 + rnd());
        g.fillRect(x, base - bh, bw, bh + 200);
        x += bw + 5;
      }
    }
    mark(g, w / 2, 250 * k, 76 * k, BRANCH.text);
    g.fillStyle = BRANCH.text;
    g.textAlign = 'center';
    g.letterSpacing = `${14 * k}px`;
    g.font = `600 ${84 * k}px ${SANS}`;
    g.fillText(BRANCH.name, w / 2, 410 * k);
    g.letterSpacing = `${8 * k}px`;
    g.fillStyle = BRANCH.accent;
    g.font = `400 ${38 * k}px ${SANS}`;
    g.fillText(BRANCH.tagline.toUpperCase(), w / 2, 476 * k);
  });
}
function labelTex(text, { size = 150, bg = BRANCH.primary, fg = BRANCH.text, w = 512, h = 256 } = {}) {
  return canvasTex(w, h, (g) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.fillStyle = fg;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.letterSpacing = '6px';
    g.font = `500 ${size}px ${SANS}`;
    g.fillText(text, w / 2, h / 2);
  });
}
function terrazzo() {
  return canvasTex(1024, 1024, (g, w, h) => {
    g.fillStyle = '#d9d6cf';
    g.fillRect(0, 0, w, h);
    const img = g.getImageData(0, 0, w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const n = (fbm(x / w, y / h, 4, 4, 4, 5) - 0.5) * 12, i = (y * w + x) * 4;
      img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
    }
    g.putImageData(img, 0, 0);
    let s = 41;
    const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    const chips = ['#8d8a84', '#f3f1ec', '#55585a', '#b5a58c', '#35565a'];
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = chips[i % chips.length];
      g.beginPath();
      const x = rnd() * w, y = rnd() * h, r = 1.5 + rnd() ** 3 * 7;
      g.ellipse(x, y, r, r * (0.55 + rnd() * 0.45), rnd() * 3, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#a9a69f'; // the joints of 1.2 m slabs (one texture is two slabs)
    for (const p of [0, w / 2]) { g.fillRect(p, 0, 1.5, h); g.fillRect(0, p, w, 1.5); }
  });
}

// ---------- materials ----------
let kit;
function branchKit(K) {
  if (kit) return kit;
  const glow = (t, s = 1) => std({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: s, roughness: 0.4 });
  const plain = (color, roughness = 0.6, metalness = 0) => std({ color, roughness, metalness });
  const floorTex = terrazzo();
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  kit = {
    floor: std({ map: floorTex, roughness: 0.28 }),
    paint: plain(0xefede8, 0.85),
    white: plain(0xf3f2ee, 0.35),
    quartz: plain(0xeeece6, 0.2),
    teal: plain(0x0f4c52, 0.6),
    tealFabric: plain(0x14565c, 0.92),
    greyFabric: plain(0x8c8d8b, 0.95),
    sandFabric: plain(0xcbc3b4, 0.95),
    ash: plain(0xb98f62, 0.55),
    walnut: plain(0x4f3626, 0.42),
    bronze: plain(0x332a23, 0.38, 0.8),
    brass: plain(0xc3a266, 0.3, 1),
    black: plain(0x121314, 0.4, 0.4),
    led: std({ color: 0xffffff, emissive: 0xfff3e2, emissiveIntensity: 1.8 }),
    ledTeal: std({ color: 0xffffff, emissive: 0x5fd0d0, emissiveIntensity: 1.6 }),
    halo: std({ color: 0xffffff, emissive: 0xffe9c8, emissiveIntensity: 2.6 }),
    glass: K.glass,
    sign: glow(signTex(), 0.35),
    signPlain: glow(signTex(''), 0.35),
    signSelf: glow(signTex('Self-service 24/7'), 0.35),
    signCafe: glow(signTex('Café & business lounge'), 0.35),
    queue: glow(queueTex(), 1.1),
    screen: glow(screenTex(), 0.9),
    kiosk: glow(screenTex('Take a ticket'), 1),
    atm: glow(screenTex('Self-service'), 1),
    media: glow(mediaTex(), 1.2),
    mediaWide: glow(mediaTex(1024, 576), 1),
    labels: [1, 2, 3, 4].map((n) => glow(labelTex(String(n)), 0.35)),
    rooms: ['Consultation', 'Consultation', 'Consultation', 'Consultation', 'Meeting', 'Meeting', 'Focus', 'Meeting'].map((t) => glow(labelTex(t, { size: 58, w: 512, h: 128 }), 0.35)),
  };
  return kit;
}

// ---------- plan ----------
// [x0, y0, x1, y1]; every room's doors name the room they lead to and the point of the doorway
const ROOMS = [
  { id: 'lobby', type: 'lobby', name: 'Entrance gallery', look: [1, 0], rects: [[2.84, -8.6, 12.32, -6.12]], doors: [['service', 3.58, -6.01]] },
  { id: 'service', type: 'service', name: 'Service hall', look: [0, -1], rects: [[0.22, -4.22, 12.32, -0.12], [2.84, -5.9, 12.32, -4.22]], inner: [4.32, -4.22, 12.32, -0.12], doors: [['lobby', 3.58, -6.01], ['consult', 5.5, -0.12], ['welcome', 12.43, -5.06]] },
  { id: 'consult', type: 'consult', name: 'Private consultation', rects: [[3.38, -0.12, 6.06, 4.4]], doors: [['service', 5.5, -0.12]] },
  { id: 'welcome', type: 'welcome', name: 'Welcome & lounge', look: [0, -1], rects: [[12.54, -5.9, 22.5, -0.12], [12.58, -0.12, 15.66, 5.0], [15.98, -0.12, 19.06, 4.6], [19.38, -0.12, 22.46, 5.0]], inner: [12.54, -5.9, 22.5, -0.12], doors: [['service', 12.43, -5.06], ['boardroom', 15.73, -6.01], ['business', 22.62, -5.06]] },
  { id: 'boardroom', type: 'boardroom', name: 'Boardroom', look: [-1, 0], cam: [18.45, -7.37], rects: [[12.54, -8.6, 18.82, -6.14]], doors: [['welcome', 15.73, -6.01]] },
  { id: 'business', type: 'business', name: 'Business lounge', look: [-1, 0], rects: [[22.74, -5.9, 30.72, -4.22], [22.74, -4.22, 34.82, -0.12], [30.72, -5.9, 32.22, -4.22]], inner: [22.74, -4.22, 30.72, -0.12], doors: [['welcome', 22.62, -5.06], ['selfservice', 31.48, -6.01], ['meeting', 28.1, -0.12]] },
  { id: 'meeting', type: 'meeting', name: 'Meeting room', look: [0, 1], cam: [27.22, 0.35], rects: [[25.78, -0.12, 28.66, 4.4]], doors: [['business', 28.1, -0.12]] },
  { id: 'selfservice', type: 'selfservice', name: 'Self-service gallery', look: [-1, 0], rects: [[22.74, -8.6, 32.22, -6.12]], doors: [['business', 31.48, -6.01]] },
];
// doors drawn on АР-8 that stay open: the customer route and the boardroom door
const OPEN_DOORS = [3.58, 12.43, 22.62, 15.73, 31.48];
// the bays between the fins: glazed rooms, closed at the end of the fins by a slatted partition (back office behind)
const BAYS = [
  { x0: 0.22, x1: 3.06, room: 0, door: 2.5, table: 'desk' },
  { x0: 3.38, x1: 6.06, room: 1, door: 5.5, table: 'desk' },
  { x0: 6.38, x1: 9.26, room: 2, door: 8.7, table: 'desk' },
  { x0: 9.58, x1: 12.26, room: 3, door: 11.7, table: 'desk' },
  { x0: 22.78, x1: 25.46, room: 4, door: 24.9, table: 'meet' },
  { x0: 25.78, x1: 28.66, room: 5, door: 28.1, table: 'meet' },
  { x0: 28.98, x1: 31.66, room: 6, door: 31.1, table: 'focus' },
  { x0: 31.98, x1: 34.86, room: 7, door: 34.3, table: 'meet' },
];
const BAY_Y0 = -0.12, BAY_Y1 = 4.4;

// Builds the fit-out at its real position (floor 1, height 0). `shell: false` is the cut-away floor view: fit-out only,
// inside the building's own walls. `shell: true` adds walls, ceiling and lights for the walk-through and the 360° bake.
// Returns the same shape as a show-flat, so both treat the branch and a flat alike.
export function buildBranch(floor, K, { shell: withShell = true } = {}) {
  const C = branchKit(K);
  const fit = new THREE.Group(), top = new THREE.Group(), lights = new THREE.Group(), bakeLights = new THREE.Group();
  const colliders = [], wallColliders = [], extraWalls = [];
  const H = CEIL;
  const solid = (a0, b0, a1, b1) => colliders.push({ x0: X(a0), x1: X(a1), z0: Z(b0), z1: Z(b1) });
  const wallSolid = (a0, b0, a1, b1) => {
    const c = { x0: X(a0), x1: X(a1), z0: Z(b0), z1: Z(b1) };
    colliders.push(c); wallColliders.push(c); extraWalls.push([a0, b0, a1, b1]);
  };
  const slab = (mat, a0, b0, a1, b1, h0, h1, o = {}, to = fit) => {
    const m = gbox(a1 - a0, h1 - h0, b1 - b0, mat, X((a0 + a1) / 2), (h0 + h1) / 2, Z((b0 + b1) / 2), o);
    to.add(m);
    return m;
  };
  const put = (o, x, y, face = 'south', { w = 0, d = 0, yy = 0 } = {}, to = fit) => {
    if (!o) return null;
    o.position.set(X(x), yy, Z(y));
    o.rotation.y = FACE[face];
    to.add(o);
    if (w && d) {
      const across = face === 'south' || face === 'north', hw = (across ? w : d) / 2, hd = (across ? d : w) / 2;
      solid(x - hw, y - hd, x + hw, y + hd);
    }
    return o;
  };
  // a flat board on a wall: `face` is the way it looks
  const board = (mat, w, h, x, y, cy, face = 'south', to = fit) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(X(x), cy, Z(y));
    m.rotation.y = FACE[face];
    m.castShadow = false; m.receiveShadow = false;
    to.add(m);
    return m;
  };
  const lib = (id, fitTo) => model(K.lib, id, fitTo);
  const plant = (x, y, h = 1.5, i = 0) => put(lib(i % 2 ? 'potted_plant_01' : 'potted_plant_02', { h }), x, y, 'south', { w: 0.55, d: 0.55 });
  const chair = (x, y, face) => put(lib('ht_chair', { d: 0.5 }) ?? ST.diningChair(K), x, y, face, { w: 0.46, d: 0.46 });
  const lounge = (x, y, face) => put(lib('modern_arm_chair_01', { w: 0.78 }) ?? ST.diningChair(K), x, y, face, { w: 0.78, d: 0.78 });
  const coffee = (x, y) => put(lib('ht_coffee_table', { w: 1.0 }), x, y, 'south', { w: 0.9, d: 0.6 });
  // wall-to-wall vertical slats along a wall's face (a run in x or in y); `far`: the wall is on the high x / y side
  const slats = (a0, b0, a1, b1, h0, h1, { far = false, mat = C.ash } = {}) => {
    const along = a1 - a0 >= b1 - b0, len = along ? a1 - a0 : b1 - b0, n = Math.floor(len / 0.09);
    for (let i = 0; i < n; i++) {
      const p = (along ? a0 : b0) + (i + 0.5) * (len / n);
      if (along) slab(mat, p - 0.024, b0, p + 0.024, b1, h0, h1);
      else slab(mat, a0, p - 0.024, a1, p + 0.024, h0, h1);
    }
    if (along) slab(C.black, a0, far ? b1 - (b1 - b0) * 0.3 : b0, a1, far ? b1 : b0 + (b1 - b0) * 0.3, h0, h1, { cast: false });
    else slab(C.black, far ? a1 - (a1 - a0) * 0.3 : a0, b0, far ? a1 : a0 + (a1 - a0) * 0.3, b1, h0, h1, { cast: false });
  };
  // upholstered sofa, front to +z, seat 0.44 m
  const sofa = (w, mat = C.tealFabric) => {
    const g = new THREE.Group();
    g.add(gbox(w, 0.3, 0.82, mat, 0, 0.28, 0, { r: 0.05 }));
    g.add(gbox(w, 0.46, 0.2, mat, 0, 0.62, -0.31, { r: 0.07 }));
    for (const s of [-1, 1]) {
      g.add(gbox(0.16, 0.36, 0.82, mat, s * (w / 2 - 0.08), 0.46, 0, { r: 0.05 }));
      g.add(gbox(0.04, 0.12, 0.7, C.bronze, s * (w / 2 - 0.12), 0.06, 0));
    }
    const n = Math.max(2, Math.round((w - 0.32) / 0.75));
    for (let i = 0; i < n; i++) g.add(gbox((w - 0.32) / n - 0.015, 0.1, 0.56, mat, -(w - 0.32) / 2 + (i + 0.5) * ((w - 0.32) / n), 0.47, 0.1, { r: 0.04 }));
    return g;
  };
  const monitor = (x, y, face, s = 1) => {
    const g = new THREE.Group();
    g.add(gbox(0.56 * s, 0.34 * s, 0.025, C.black, 0, 0.27 * s, 0));
    g.add(gbox(0.52 * s, 0.3 * s, 0.002, C.screen, 0, 0.27 * s, 0.014, { cast: false }));
    g.add(gbox(0.04, 0.12 * s, 0.03, C.black, 0, 0.05 * s, -0.01));
    g.add(gbox(0.2, 0.012, 0.15, C.black, 0, 0.006, 0));
    put(g, x, y, face, { yy: 0.77 });
  };
  const kiosk = (x, y, face, mat = C.kiosk, tall = 1.55) => {
    const g = new THREE.Group();
    g.add(gbox(0.52, tall, 0.14, C.white, 0, tall / 2, 0, { r: 0.03 }));
    g.add(gbox(0.42, 0.62, 0.004, mat, 0, tall - 0.42, 0.072, { cast: false }));
    g.add(gbox(0.42, 0.05, 0.16, C.black, 0, tall - 0.86, 0.06));
    g.add(gbox(0.54, 0.02, 0.16, C.teal, 0, tall - 0.02, 0));
    g.add(gbox(0.56, 0.03, 0.34, C.black, 0, 0.015, 0.02));
    put(g, x, y, face, { w: 0.56, d: 0.36 });
  };
  const table = (x0, y0, x1, y1, mat = C.walnut, h = 0.74) => {
    slab(mat, x0, y0, x1, y1, h - 0.04, h);
    const across = x1 - x0 >= y1 - y0;
    for (const s of [0.1, 0.9]) {
      const a = across ? x0 + (x1 - x0) * s : x0 + 0.08, b = across ? y0 + 0.08 : y0 + (y1 - y0) * s;
      slab(C.bronze, a - (across ? 0.025 : 0), b - (across ? 0 : 0.025), across ? a + 0.025 : x1 - 0.08, across ? y1 - 0.08 : b + 0.025, 0, h - 0.04);
    }
    solid(x0, y0, x1, y1);
  };
  // suspended linear pendant over a table
  const pendant = (x, y, len, along = 'x') => {
    const lx = along === 'x' ? len : 0.05, ly = along === 'x' ? 0.05 : len;
    slab(C.black, x - lx / 2, y - ly / 2, x + lx / 2, y + ly / 2, 2.32, 2.38, { cast: false }, top);
    slab(C.led, x - lx / 2 + 0.02, y - ly / 2 + 0.01, x + lx / 2 - 0.02, y + ly / 2 - 0.01, 2.315, 2.32, { cast: false }, top);
    for (const s of [-0.42, 0.42]) {
      const px = x + (along === 'x' ? s * len : 0), py = y + (along === 'x' ? 0 : s * len);
      top.add(cyl(0.004, 0.004, H - 2.38, C.black, X(px), (H + 2.38) / 2, Z(py), 6, { cast: false }));
    }
  };

  // ---- floor (the flats and lift rooms south of y = 8 keep theirs) ----
  for (const [a0, b0, a1, b1] of [[-0.1, -8.75, 12.43, 8], [12.43, -8.75, 22.62, 5.1], [15.9, 5.1, 19.2, 8], [22.62, -8.75, 35.1, 8]]) {
    const geo = new THREE.PlaneGeometry(a1 - a0, b1 - b0).rotateX(-Math.PI / 2);
    const uv = geo.attributes.uv, pos = geo.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) + X((a0 + a1) / 2)) / 2.4, (pos.getZ(i) + Z((b0 + b1) / 2)) / 2.4);
    const m = mesh(geo, C.floor, { cast: false });
    m.position.set(X((a0 + a1) / 2), 0.008, Z((b0 + b1) / 2));
    fit.add(m);
  }

  // ---- entrance gallery ----
  slab(C.teal, 4.9, -6.15, 11.9, -6.12, 0, H - 0.02, { cast: false });
  board(C.signPlain, 3.6, 0.675, 8.4, -6.155, 2.75, 'north');
  for (const x of [5.3, 8.4, 11.5]) {
    slab(C.white, x - 0.34, -6.82, x + 0.34, -6.3, 0, 0.9);
    solid(x - 0.34, -6.82, x + 0.34, -6.3);
    put(lib('ceramic_vase_01', { h: 0.42 }), x, -6.56, 'south', { yy: 0.9 });
  }
  put(sofa(2.4, C.greyFabric), 10.1, -8.0, 'south', { w: 2.4, d: 0.82 });
  slab(C.bronze, 6.8, -8.55, 8.4, -7.8, 0.008, 0.014, { cast: false });
  plant(3.4, -8.1, 1.7, 1);
  plant(11.8, -8.1, 1.7, 0);
  // guide totem on the way to the service hall
  slab(C.teal, 4.2, -7.3, 4.5, -7.2, 0, 2.2);
  board(C.kiosk, 0.26, 0.42, 4.35, -7.305, 1.7, 'north');
  solid(4.2, -7.3, 4.5, -7.2);

  // ---- service hall: four desks along a slatted brand wall ----
  slats(4.5, -5.9, 12.1, -5.84, 0, H - 0.02);
  board(C.sign, 3.4, 0.64, 8.2, -5.82, 3.2, 'south', top);
  board(C.queue, 2.4, 0.7, 8.2, -5.82, 2.2, 'south', top);
  const ca = 5.2, cb = 11.0, cy0 = -4.85, cy1 = -4.15;
  slab(C.teal, ca, cy0 + 0.05, cb, cy1, 0.1, 0.74);
  slab(C.black, ca + 0.04, cy0 + 0.09, cb - 0.04, cy1 - 0.04, 0, 0.1, { cast: false });
  slab(C.ledTeal, ca + 0.02, cy1 - 0.042, cb - 0.02, cy1 - 0.03, 0.09, 0.1, { cast: false });
  slab(C.quartz, ca - 0.03, cy0, cb + 0.03, cy1 + 0.04, 0.74, 0.78);
  solid(ca, cy0, cb, cy1);
  [5.93, 7.38, 8.83, 10.28].forEach((x, i) => {
    monitor(x, cy0 + 0.3, 'north');
    chair(x, -5.32, 'south');
    chair(x - 0.3, -3.78, 'north');
    chair(x + 0.3, -3.78, 'north');
    board(C.labels[i], 0.3, 0.15, x, cy1 + 0.002, 0.52);
    if (i < 3) slab(C.glass, x + 0.72, cy0 + 0.1, x + 0.73, cy1 + 0.02, 0.78, 1.4, { cast: false });
  });
  // waiting: two sofa groups, tickets by the door
  put(sofa(2.2), 6.2, -1.15, 'north', { w: 2.2, d: 0.82 });
  put(sofa(2.2), 9.8, -1.15, 'north', { w: 2.2, d: 0.82 });
  coffee(8.0, -1.35);
  kiosk(4.72, -5.4, 'east');
  kiosk(4.72, -4.72, 'east');
  plant(0.7, -3.7, 1.7, 0);
  plant(11.9, -0.65, 1.5, 1);
  lounge(1.4, -1.8, 'east');
  lounge(1.4, -0.8, 'east');
  put(lib('ht_floor_lamp', { h: 1.85 }), 0.7, -1.3, 'east', { w: 0.4, d: 0.4 });

  // ---- welcome: an island desk under a ring of light, the media wall on the axis ----
  const dx0 = 15.4, dx1 = 19.6, dy0 = -3.3, dy1 = -2.45;
  slab(C.teal, dx0, dy0, dx1, dy1, 0.08, 1.06, { r: 0.04 });
  slab(C.black, dx0 + 0.04, dy0 + 0.04, dx1 - 0.04, dy1 - 0.04, 0, 0.08, { cast: false });
  slab(C.ledTeal, dx0 + 0.02, dy1 - 0.03, dx1 - 0.02, dy1 - 0.02, 0.07, 0.08, { cast: false });
  slab(C.quartz, dx0 - 0.04, dy0 - 0.04, dx1 + 0.04, dy1 + 0.04, 1.06, 1.1);
  slab(C.brass, dx0, dy1 + 0.001, dx1, dy1 + 0.006, 0.96, 0.98, { cast: false });
  board(C.signPlain, 1.9, 0.356, 17.5, dy1 + 0.008, 0.62);
  solid(dx0, dy0, dx1, dy1);
  for (const x of [16.5, 18.5]) { monitor(x, dy0 + 0.4, 'north', 0.9); chair(x, -3.85, 'south'); }
  const halo = new THREE.Mesh(new THREE.TorusGeometry(2.1, 0.035, 10, 96).rotateX(Math.PI / 2), C.halo);
  halo.position.set(X(17.5), 3.25, Z(-2.9));
  top.add(halo);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.6;
    top.add(cyl(0.004, 0.004, H - 3.25, C.black, X(17.5 + Math.cos(a) * 2.1), (H + 3.25) / 2, Z(-2.9 + Math.sin(a) * 2.1), 6, { cast: false }));
  }
  // brand over the doors of the north wall, brass line under it
  board(C.sign, 3.2, 0.6, 17.5, -5.88, 3.2, 'south', top);
  slab(C.brass, 12.6, -5.9, 22.44, -5.885, 2.7, 2.715, { cast: false }, top);
  // the media wall, closing the axis
  slab(C.black, 15.98, 4.6, 19.06, 4.75, 0, H);
  board(C.media, 2.9, 2.9, 17.52, 4.595, 1.95, 'north');
  solid(15.98, 4.6, 19.06, 4.75);
  extraWalls.push([15.98, 4.6, 19.06, 4.75]);
  plant(16.45, 4.05, 1.4, 1);
  plant(18.6, 4.05, 1.4, 0);
  // lounges in the two side bays
  for (const west of [true, false]) {
    const wx = west ? 12.6 : 22.46, s = west ? 1 : -1, f = west ? 'east' : 'west';
    put(sofa(2.6), wx + s * 0.5, 2.3, f, { w: 2.6, d: 0.82 });
    coffee(wx + s * 1.5, 2.3);
    lounge(wx + s * 2.5, 1.5, west ? 'west' : 'east');
    lounge(wx + s * 2.5, 3.1, west ? 'west' : 'east');
    slats(west ? wx : wx - 0.06, 0.2, west ? wx + 0.06 : wx, 4.7, 0, H - 0.02, { far: !west });
    plant(wx + s * 0.5, 4.45, 1.6, west ? 0 : 1);
    plant(wx + s * 0.5, 0.25, 1.2, west ? 1 : 0);
  }

  // ---- boardroom ----
  table(13.3, -7.82, 18.1, -6.92, C.walnut);
  for (let x = 13.8; x < 18; x += 0.95) { chair(x, -8.2, 'south'); chair(x, -6.54, 'north'); }
  slats(12.54, -8.6, 18.82, -8.54, 0, H - 0.02);
  slab(C.black, 12.54, -8.2, 12.6, -6.6, 0.84, 1.8, { cast: false });
  board(C.mediaWide, 1.54, 0.87, 12.605, -7.4, 1.32, 'east');
  pendant(15.7, -7.37, 3.6);

  // ---- business lounge: café, a long work table, a corner to sit in ----
  const bx0 = 24.2, bx1 = 29.8;
  slab(C.white, bx0, -5.9, bx1, -5.3, 0, 0.92);
  slab(C.quartz, bx0, -5.9, bx1, -5.28, 0.92, 0.96);
  slats(bx0, -5.9, bx1, -5.84, 1.0, H - 0.02);
  board(C.signCafe, 3.2, 0.6, 27, -5.82, 3.2, 'south', top);
  for (const h of [1.42, 1.86]) {
    slab(C.ash, bx0 + 0.3, -5.84, bx1 - 0.3, -5.6, h, h + 0.035);
    for (let x = bx0 + 0.5, k = 0; x < bx1 - 0.4; x += 0.34, k++) top.add(cyl(0.045, 0.04, 0.2 + (k % 3) * 0.04, [C.white, C.teal, C.bronze][k % 3], X(x), h + 0.13, Z(-5.72), 12));
  }
  slab(C.black, 26.3, -5.76, 27.1, -5.38, 0.96, 1.42); // the coffee machine
  slab(C.brass, 26.3, -5.385, 27.1, -5.375, 1.2, 1.38, { cast: false });
  slab(C.teal, bx0, -4.65, bx1, -4.0, 0.08, 1.04);
  slab(C.black, bx0 + 0.04, -4.61, bx1 - 0.04, -4.04, 0, 0.08, { cast: false });
  slab(C.quartz, bx0 - 0.03, -4.68, bx1 + 0.03, -3.96, 1.04, 1.08);
  solid(bx0, -5.9, bx1, -5.3);
  solid(bx0, -4.65, bx1, -4.0);
  for (let x = bx0 + 0.5; x < bx1 - 0.2; x += 0.9) {
    const st = new THREE.Group();
    st.add(cyl(0.18, 0.18, 0.05, C.tealFabric, 0, 0.74, 0, 20));
    st.add(cyl(0.02, 0.02, 0.72, C.bronze, 0, 0.36, 0, 10));
    st.add(cyl(0.17, 0.17, 0.014, C.bronze, 0, 0.008, 0, 20));
    put(st, x, -3.55, 'north', { w: 0.34, d: 0.34 });
  }
  table(24.4, -2.1, 30.4, -1.1, C.walnut);
  for (let x = 24.95; x < 30.2; x += 0.98) {
    chair(x, -2.52, 'south');
    chair(x, -0.68, 'north');
  }
  for (const x of [25.6, 27.4, 29.2]) pendant(x, -1.6, 1.5);
  // the corner
  put(sofa(2.6, C.sandFabric), 33.1, -3.6, 'south', { w: 2.6, d: 0.82 });
  coffee(33.1, -2.3);
  lounge(31.7, -2.2, 'east');
  lounge(34.3, -1.5, 'north');
  put(lib('ht_floor_lamp', { h: 1.85 }), 31.5, -3.7, 'east', { w: 0.4, d: 0.4 });
  plant(34.3, -3.8, 1.6, 1);
  plant(23.1, -0.6, 1.5, 0);

  // ---- self-service gallery ----
  slab(C.teal, 23.2, -6.15, 30.5, -6.12, 0, H - 0.02, { cast: false });
  board(C.signSelf, 3.6, 0.675, 26.9, -6.155, 3.0, 'north');
  for (let i = 0; i < 5; i++) {
    const x = 24.2 + i * 1.3;
    kiosk(x, -6.33, 'north', C.atm, 1.62);
    if (i < 4) slab(C.glass, x + 0.64, -6.55, x + 0.65, -6.15, 0.1, 1.9, { cast: false });
  }
  put(sofa(2.4, C.greyFabric), 30.2, -8.0, 'south', { w: 2.4, d: 0.82 });
  slab(C.bronze, 26.7, -8.55, 28.3, -7.8, 0.008, 0.014, { cast: false });
  plant(23.3, -8.1, 1.7, 0);
  plant(31.7, -8.1, 1.7, 1);

  // ---- glazed rooms in the bays between the fins ----
  for (const b of BAYS) {
    const mid = (b.x0 + b.x1) / 2, doorW = 1.0, d0 = b.door - doorW / 2, d1 = b.door + doorW / 2;
    // glass to the hall, with a door opening and a head over it
    for (const [a, c] of [[b.x0, d0], [d1, b.x1]]) {
      if (c - a < 0.05) continue;
      slab(C.glass, a, BAY_Y0 - 0.006, c, BAY_Y0 + 0.006, 0.02, 2.5, { cast: false });
      slab(C.bronze, a, BAY_Y0 - 0.025, c, BAY_Y0 + 0.025, 0, 0.04);
      wallSolid(a, BAY_Y0 - 0.03, c, BAY_Y0 + 0.03);
    }
    slab(C.bronze, b.x0, BAY_Y0 - 0.03, b.x1, BAY_Y0 + 0.03, 2.46, 2.56);
    for (const x of [d0, d1]) slab(C.bronze, x - 0.02, BAY_Y0 - 0.025, x + 0.02, BAY_Y0 + 0.025, 0, 2.46);
    slab(C.white, b.x0, BAY_Y0 - 0.05, b.x1, BAY_Y0 + 0.05, 2.56, H, { cast: false }, top);
    board(C.rooms[b.room], 0.8, 0.2, mid, BAY_Y0 - 0.052, 2.8, 'north', top);
    // slatted back wall with the back office behind it
    slab(C.paint, b.x0, BAY_Y1, b.x1, BAY_Y1 + 0.12, 0, H);
    wallSolid(b.x0, BAY_Y1, b.x1, BAY_Y1 + 0.12);
    slats(b.x0, BAY_Y1 - 0.06, b.x1, BAY_Y1, 0, H - 0.02, { far: true });
    slab(C.white, b.x0 + 0.1, 6.95, b.x1 - 0.1, 7.38, 0, 2.2); // back office: cupboards along the end wall
    solid(b.x0 + 0.1, 6.95, b.x1 - 0.1, 7.38);
    if (b.table === 'desk') {
      table(mid - 0.8, 1.9, mid + 0.8, 2.7, C.walnut);
      monitor(mid + 0.2, 2.45, 'south');
      chair(mid, 3.12, 'north');
      chair(mid - 0.35, 1.46, 'south');
      chair(mid + 0.35, 1.46, 'south');
      slab(C.black, mid - 0.6, BAY_Y1 - 0.075, mid + 0.6, BAY_Y1 - 0.06, 1.3, 2.05, { cast: false });
      board(C.mediaWide, 1.16, 0.65, mid, BAY_Y1 - 0.08, 1.675, 'north');
      plant(b.x0 + 0.4, 3.95, 1.2, b.room);
    } else if (b.table === 'meet') {
      table(mid - 0.5, 0.75, mid + 0.5, 3.35, C.walnut);
      for (const y of [1.15, 2.05, 2.95]) { chair(mid - 0.82, y, 'east'); chair(mid + 0.82, y, 'west'); }
      pendant(mid, 2.05, 1.8, 'y');
      slab(C.black, mid - 0.8, BAY_Y1 - 0.075, mid + 0.8, BAY_Y1 - 0.06, 1.0, 1.96, { cast: false });
      board(C.mediaWide, 1.54, 0.87, mid, BAY_Y1 - 0.08, 1.48, 'north');
    } else {
      // two focus desks against the fins and a quiet chair
      for (const [x, f, dx] of [[b.x0 + 0.42, 'east', 0.5], [b.x1 - 0.42, 'west', -0.5]]) {
        table(x - 0.36, 1.2, x + 0.36, 2.4, C.walnut);
        chair(x + dx * 1.3, 1.8, f === 'east' ? 'west' : 'east');
      }
      lounge(mid, 3.6, 'north');
    }
  }

  // ---- shell: walls, doors, glazing, ceiling, lighting (walk-through and 360° bake only) ----
  const walls = floor.sheet.walls.filter((r) => r[1] < 8.2 && r[3] > -9 && (r[2] - r[0]) * (r[3] - r[1]) >= 0.003);
  const openings = floor.sheet.openings.filter((o) => o.rect[1] < 8.2);
  const sh = new THREE.Group();
  if (withShell) {
    for (const r of walls) {
      slab(C.paint, r[0], r[1], r[2], r[3], 0, H + 0.1, {}, sh);
      const c = { x0: X(r[0]), x1: X(r[2]), z0: Z(r[1]), z1: Z(r[3]) };
      colliders.push(c); wallColliders.push(c);
    }
    // the plan's outer walls have small gaps at the columns: a skin just outside keeps the daylight out of them
    for (const [a0, b0, a1, b1] of [[-0.46, -9, -0.22, 8.4], [35.24, -9, 35.48, 8.4], [-0.46, 8.16, 35.48, 8.4]]) slab(C.paint, a0, b0, a1, b1, 0, H + 0.1, {}, sh);
    for (const o of openings) {
      const r = o.rect, w = r[2] - r[0], d = r[3] - r[1], cx = (r[0] + r[2]) / 2, cy = (r[1] + r[3]) / 2;
      if (o.kind === 'door') {
        const open = OPEN_DOORS.some((v) => Math.abs(cx - v) < 0.3);
        slab(C.paint, r[0], r[1], r[2], r[3], open ? 2.5 : 2.15, H + 0.1, {}, sh);
        if (!open) {
          slab(C.walnut, r[0] + (w >= d ? 0.02 : 0), r[1] + (w >= d ? 0.05 : 0.02), r[2] - (w >= d ? 0.02 : 0), r[3] - (w >= d ? 0.05 : 0.02), 0.01, 2.14, {}, sh);
          const c = { x0: X(r[0]), x1: X(r[2]), z0: Z(r[1]), z1: Z(r[3]) };
          colliders.push(c); wallColliders.push(c);
        }
        continue;
      }
      // the street front: floor-to-head glass (both galleries read as one shopfront) with a glazed door in the middle
      const head = 3.6, n = Math.max(1, Math.round(w / 1.5));
      slab(C.glass, r[0], cy - 0.008, r[2], cy + 0.008, 0.02, head, { cast: false }, sh);
      slab(C.paint, r[0], r[1], r[2], r[3], head, H + 0.1, {}, sh);
      slab(C.bronze, r[0], r[1], r[2], r[3], 0, 0.06, {}, sh);
      slab(C.bronze, r[0], cy - 0.04, r[2], cy + 0.04, head - 0.06, head, {}, sh);
      slab(C.bronze, r[0], cy - 0.03, r[2], cy + 0.03, 2.6, 2.65, {}, sh);
      for (let i = 0; i <= n; i++) { const x = r[0] + (i / n) * w; slab(C.bronze, x - 0.025, cy - 0.04, x + 0.025, cy + 0.04, 0, head, {}, sh); }
      for (const s of [-1, 1]) slab(C.brass, cx + s * 0.1 - 0.012, cy + 0.04, cx + s * 0.1 + 0.012, cy + 0.07, 0.9, 1.6, {}, sh);
      const c = { x0: X(r[0]), x1: X(r[2]), z0: Z(r[1]), z1: Z(r[3]) };
      colliders.push(c); wallColliders.push(c);
    }
    // ceiling with a black shadow gap to the walls, and linear lights in rows
    slab(K.ceiling, -0.46, -9, 35.48, 8.4, H, H + 0.1, { cast: false }, sh);
    const row = (a0, a1, b, along = 'x') => {
      const r = along === 'x' ? [a0, b - 0.04, a1, b + 0.04] : [b - 0.04, a0, b + 0.04, a1];
      slab(C.black, r[0], r[1], r[2], r[3], H - 0.012, H, { cast: false }, sh);
      slab(C.led, r[0] + 0.015, r[1] + 0.015, r[2] - 0.015, r[3] - 0.015, H - 0.016, H - 0.012, { cast: false }, sh);
    };
    for (const y of [-7.35]) { row(3.3, 11.9, y); row(13, 18.4, y); row(23.2, 31.8, y); }
    for (const y of [-3.2, -1.2]) { row(4.6, 11.9, y); row(23.2, 30.4, y); }
    row(0.6, 3.2, -2.2); row(31.2, 34.5, -2.2);
    for (const x of [13.2, 21.9]) row(-5.4, -0.5, x, 'y');
    for (const x of [14.1, 20.9]) row(0.3, 4.6, x, 'y');
    row(0.4, 4.2, 17.5, 'y');
    for (const b of BAYS) row(0.3, 4.1, (b.x0 + b.x1) / 2 + (b.table === 'meet' ? 1 : 0), 'y');
    for (const [x, y] of [[8.2, -2.5], [17.5, -3.2], [27.5, -2.5], [7.6, -7.35], [27.5, -7.35], [15.7, -7.35]]) {
      // one real-time light per zone; the watts are the path tracer's
      const p = new THREE.PointLight(0xfff0dc, 3.5, 16, 2);
      p.position.set(X(x), H - 0.5, Z(y));
      p.userData.watts = 60;
      lights.add(p);
    }
    // the path tracer gets the rest of the rooms' light from an even grid under the ceiling
    const grid = [[1.8, -2.2], [5.5, -4], [11, -4], [5.5, -1], [11, -1], [14, 2.3], [21, 2.3], [17.5, 2], [14, -3.5], [21, -3.5], [24.6, -3], [30, -3], [24.6, -0.8], [30, -0.8], [33, -2.3], [5, -7.35], [11, -7.35], [24.5, -7.35], [31, -7.35]];
    for (const b of BAYS) grid.push([(b.x0 + b.x1) / 2, 2.1]);
    for (const [x, y] of grid) {
      const p = new THREE.PointLight(0xfff0dc, 0);
      p.position.set(X(x), H - 0.4, Z(y));
      p.userData.watts = 30;
      bakeLights.add(p);
    }
  }

  const rooms = ROOMS.map((r) => {
    const area = +r.rects.reduce((a, q) => a + (q[2] - q[0]) * (q[3] - q[1]), 0).toFixed(1);
    const bbox = [Math.min(...r.rects.map((q) => q[0])), Math.min(...r.rects.map((q) => q[1])), Math.max(...r.rects.map((q) => q[2])), Math.max(...r.rects.map((q) => q[3]))];
    return { ...r, area, bbox, inner: r.inner ?? r.rects[0], label: [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2], fixtures: 0, unit: { rooms: null }, doors: r.doors.map(([to, x, y]) => ({ to, c: [x, y] })) };
  });

  if (!withShell) return { group: merge(fit), colliders, rooms }; // (meshes directly under the group, like a furnished flat)
  const group = new THREE.Group();
  group.add(merge(fit), merge(top), merge(sh), lights);
  const unit = { rects: rooms.flatMap((r) => r.rects), kind: 'commercial', code: BRANCH.name };
  return { group, bakeLights, colliders, wallColliders, rooms, sheet: { walls: [...walls, ...extraWalls], openings, balconies: [], fixtures: [], doorSwings: [] }, unit, h: H };
}

// merge static parts into one mesh per material
function merge(root) {
  root.updateMatrixWorld(true);
  const by = new Map();
  root.traverse((o) => {
    if (!o.isMesh) return;
    const geo = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()).applyMatrix4(o.matrixWorld);
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    if (!by.has(o.material)) by.set(o.material, []);
    by.get(o.material).push(geo);
  });
  const out = new THREE.Group();
  for (const [mat, list] of by) {
    const m = new THREE.Mesh(mergeGeometries(list), mat);
    m.castShadow = !mat.transparent;
    m.receiveShadow = true;
    out.add(m);
  }
  return out;
}
