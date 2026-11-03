// Ground-floor shops: the retail podium between the two residential lobbies is let as five shops, each
// fitted out for one tenant brand. Brands are Uzbek and purely a sales presentation: each is one entry in
// SHOPS (name, kind, colours, tagline), so a tenant can be swapped by editing that entry and re-rendering
// that shop's 360° views. Colours are stand-ins until the tenants' official brand assets arrive.
//
// Plan coordinates as everywhere else (x east from axis 1, y south from the north facade line); the shop
// fronts sit behind the colonnade's glazing at y = -3.95 and run back to the bay partitions at y = 5.5.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { box as gbox, cyl, mesh } from '../geo.js';
import { model } from './models.js';
import * as ST from '../styles/warmMinimal.js';
import * as Fn from '../furniture.js';
import { CX, CY } from './model.js';

export const SHOPS = [
  { slug: 'safia', brand: 'Safia', kind: 'cafe', tagline: 'Bakery & café', x0: 0.2, x1: 6.05, colors: { primary: '#7a1f2b', accent: '#e9d6b8', text: '#fff7ea' } },
  { slug: 'evos', brand: 'EVOS', kind: 'fastfood', tagline: 'Lavash · burgers · fries', x0: 9.55, x1: 15.1, colors: { primary: '#1f8f4e', accent: '#ffcf3a', text: '#ffffff' } },
  { slug: 'kanishka', brand: 'Kanishka', kind: 'fashion', tagline: 'Leather & clothing', x0: 15.3, x1: 19.3, colors: { primary: '#3b2a20', accent: '#c49a6c', text: '#f3e6d4' } },
  { slug: 'caravan', brand: 'Caravan', kind: 'restaurant', tagline: 'Uzbek cuisine', x0: 19.5, x1: 25.45, colors: { primary: '#1d3b5a', accent: '#d8a548', text: '#f6e7c8' } },
  { slug: 'saadi', brand: 'Saadi', kind: 'fashion', tagline: 'Modern Uzbek fashion', x0: 28.95, x1: 34.8, colors: { primary: '#efe8de', accent: '#8c2f39', text: '#2a2420' } },
];
export const SHOP_Y0 = -3.95, SHOP_Y1 = 5.5, SHOP_SPLIT = 0.9;
export const SHOP_CEIL = 3.9;
const KIND = {
  cafe: { label: 'Café', front: 'Café', back: 'Pastry counter' },
  fastfood: { label: 'Fast food', front: 'Dining area', back: 'Order counter' },
  restaurant: { label: 'Restaurant', front: 'Dining hall', back: 'Tea bar' },
  fashion: { label: 'Clothing store', front: 'Shop floor', back: 'Fitting & cash desk' },
};
export const shopKindLabel = (s) => KIND[s.kind].label;
// a floor-1 bay partition standing inside a shop (left out: each shop is fitted out as one space)
export const insideShop = (r) => r[1] > 0.9 && r[3] < 6.5 && SHOPS.some((s) => r[0] > s.x0 + 0.1 && r[2] < s.x1 - 0.1);

const X = (x) => x - CX, Z = (y) => y - CY;
const std = (p) => new THREE.MeshStandardMaterial(p);
const cache = new Map();
const colorMat = (hex, rough = 0.6, metal = 0) => {
  const k = `${hex}:${rough}:${metal}`;
  if (!cache.has(k)) cache.set(k, std({ color: hex, roughness: rough, metalness: metal }));
  return cache.get(k);
};

// ---------- brand graphics (canvas textures) ----------
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
function signTex(s, { tagline = true } = {}) {
  return canvasTex(1536, 384, (g, w, h) => {
    g.fillStyle = s.colors.primary;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = s.colors.accent;
    g.lineWidth = 8;
    g.strokeRect(18, 18, w - 36, h - 36);
    g.fillStyle = s.colors.text;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const serif = s.kind === 'restaurant' || s.kind === 'fashion' || s.kind === 'cafe';
    g.font = `${s.kind === 'fastfood' ? 800 : 600} ${tagline ? 170 : 210}px ${serif ? 'Georgia, "Times New Roman", serif' : '"Segoe UI", Arial, sans-serif'}`;
    g.letterSpacing = s.kind === 'fashion' ? '24px' : '8px';
    g.fillText(s.kind === 'fashion' ? s.brand.toUpperCase() : s.brand, w / 2, tagline ? h * 0.42 : h / 2);
    if (tagline) {
      g.fillStyle = s.colors.accent;
      g.letterSpacing = '6px';
      g.font = '500 54px "Segoe UI", Arial, sans-serif';
      g.fillText(s.tagline.toUpperCase(), w / 2, h * 0.8);
    }
  });
}
function menuTex(s, title, items) {
  return canvasTex(768, 1024, (g, w, h) => {
    g.fillStyle = '#16120f';
    g.fillRect(0, 0, w, h);
    g.fillStyle = s.colors.accent;
    g.font = '700 72px "Segoe UI", Arial, sans-serif';
    g.textAlign = 'center';
    g.fillText(title, w / 2, 120);
    g.fillRect(w * 0.2, 160, w * 0.6, 6);
    g.textAlign = 'left';
    items.forEach(([name, price], i) => {
      const y = 270 + i * 120;
      g.fillStyle = '#f4ede2';
      g.font = '500 50px "Segoe UI", Arial, sans-serif';
      g.fillText(name, 70, y);
      g.textAlign = 'right';
      g.fillStyle = s.colors.accent;
      g.fillText(price, w - 70, y);
      g.textAlign = 'left';
    });
  });
}
// ikat: the blurred-edge zigzag pattern of Uzbek silk, for feature walls and cushions
function ikatTex(c1, c2, c3) {
  return canvasTex(1024, 1024, (g, w, h) => {
    g.fillStyle = c1;
    g.fillRect(0, 0, w, h);
    for (let col = 0; col < 4; col++) {
      for (let row = 0; row < 6; row++) {
        const cx = (col + 0.5) * (w / 4), cy = (row + 0.5) * (h / 6);
        for (let k = 0; k < 2; k++) {
          g.fillStyle = k ? c3 : c2;
          g.beginPath();
          const s = k ? 0.55 : 1;
          const rx = (w / 8) * s, ry = (h / 12) * s;
          for (let i = 0; i <= 24; i++) {
            const a = (i / 24) * Math.PI * 2, jag = 1 + (i % 2 ? 0.12 : -0.05);
            g.lineTo(cx + Math.cos(a) * rx * jag, cy + Math.sin(a) * ry * jag);
          }
          g.fill();
        }
      }
    }
    // feathered (dyed-thread) edges
    const img = g.getImageData(0, 0, w, h);
    const out = g.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const sx = Math.min(w - 1, Math.max(0, x + Math.round(Math.sin(y * 0.9) * 4)));
      const i = (y * w + x) * 4, j = (y * w + sx) * 4;
      for (let k = 0; k < 4; k++) out.data[i + k] = img.data[j + k];
    }
    g.putImageData(out, 0, 0);
  });
}
const texMat = (t, extra = {}) => std({ map: t, roughness: 0.6, ...extra });
const glowMat = (t, strength = 1.6) => std({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: strength, roughness: 0.5 });

// ---------- builder ----------
// Builds one shop at its real position (floor 1, height 0). Returns the same shape as a show-flat so the
// walk-through, plan and 360° bake treat shops and flats alike.
export function buildShop(s, M) {
  const g = new THREE.Group();
  const lights = new THREE.Group();
  const colliders = [], wallColliders = [];
  const { x0, x1 } = s, y0 = SHOP_Y0, y1 = SHOP_Y1, H = SHOP_CEIL;
  const W = x1 - x0, cx = (x0 + x1) / 2;
  const C = s.colors;
  const add = (o) => (g.add(o), o);
  const solid = (a0, b0, a1, b1, wall = false) => {
    const c = { x0: X(a0), x1: X(a1), z0: Z(b0), z1: Z(b1) };
    colliders.push(c);
    if (wall) wallColliders.push(c);
  };
  // plan-rect box: [a0, b0] - [a1, b1] in plan, h0..h1 in height
  const slab = (mat, a0, b0, a1, b1, h0, h1, o = {}) => add(gbox(a1 - a0, h1 - h0, b1 - b0, mat, X((a0 + a1) / 2), (h0 + h1) / 2, Z((b0 + b1) / 2), o));
  // object (front faces +z) placed at a plan point, facing a direction
  const FACE = { south: 0, north: Math.PI, east: Math.PI / 2, west: -Math.PI / 2 };
  const put = (o, x, y, face = 'south', { yy = 0, w = 0, d = 0 } = {}) => {
    if (!o) return null;
    o.position.set(X(x), yy, Z(y));
    o.rotation.y = FACE[face];
    add(o);
    if (w && d) {
      const across = face === 'south' || face === 'north';
      const hw = (across ? w : d) / 2, hd = (across ? d : w) / 2;
      solid(x - hw, y - hd, x + hw, y + hd);
    }
    return o;
  };
  const lib = (id, fit) => model(M.lib, id, fit);
  const plant = (x, y, h = 1.3, i = 0) => put(lib(i % 2 ? 'potted_plant_01' : 'potted_plant_02', { h }) ?? Fn.plant(M, h, 'fiddle', 'white', i), x, y, 'south', { w: 0.5, d: 0.5 });
  const light = (x, y, watts = 60, color = 0xffdcb0) => {
    // 3D view light (candela) plus the Cycles power used by the 360° bake
    const p = new THREE.PointLight(color, Math.min(6, watts / 12), 9, 2);
    p.position.set(X(x), H - 0.5, Z(y));
    p.userData.watts = watts;
    lights.add(p);
  };

  // ---- shell: floor, ceiling, walls, storefront ----
  const floorMat = { cafe: M.stone, fastfood: colorMat(0x8f8a84, 0.35), restaurant: M.darkWood ?? M.walnut, fashion: M.marble }[s.kind];
  const wallMat = s.kind === 'restaurant' ? colorMat(0xe8dcc8, 0.9) : colorMat(s.kind === 'fastfood' ? 0xf6f5f2 : 0xf1ebe1, 0.9);
  slab(floorMat, x0, y0, x1, y1, -0.02, 0.006, { cast: false });
  slab(M.ceiling, x0 - 0.2, y0 - 0.1, x1 + 0.2, y1 + 0.2, H, H + 0.08, { cast: false });
  for (const [a, b] of [[x0 - 0.2, x0], [x1, x1 + 0.2]]) { slab(wallMat, a, y0 - 0.05, b, y1 + 0.2, 0, H); solid(a, y0, b, y1, true); }
  slab(wallMat, x0 - 0.2, y1, x1 + 0.2, y1 + 0.2, 0, H);
  solid(x0, y1, x1, y1 + 0.2, true);
  // storefront: full-height glass in slim bronze frames, a glass door in the middle, transom with the sign
  const gy = y0 - 0.02;
  slab(M.glass, x0, gy - 0.012, x1, gy, 0.05, H - 0.05, { cast: false });
  slab(M.frame, x0, gy - 0.06, x1, gy + 0.04, 0, 0.06);
  slab(M.frame, x0, gy - 0.06, x1, gy + 0.04, 3.0, 3.06);
  slab(M.frame, x0, gy - 0.06, x1, gy + 0.04, H - 0.06, H);
  const mullions = Math.max(2, Math.round(W / 1.5));
  for (let i = 0; i <= mullions; i++) { const x = x0 + (i / mullions) * W; slab(M.frame, x - 0.03, gy - 0.06, x + 0.03, gy + 0.04, 0, H); }
  slab(M.brass, cx - 0.5, gy + 0.04, cx - 0.47, gy + 0.08, 0.9, 1.9);
  slab(M.brass, cx + 0.47, gy + 0.04, cx + 0.5, gy + 0.08, 0.9, 1.9);
  solid(x0, gy - 0.06, cx - 0.6, gy + 0.04, true);
  solid(cx + 0.6, gy - 0.06, x1, gy + 0.04, true);
  // illuminated sign behind the glass in the transom, facing the street
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(W - 0.5, 4.2), 0.66), glowMat(signTex(s, { tagline: false }), 1.2));
  sign.position.set(X(cx), 3.45, Z(gy + 0.06));
  sign.rotation.y = Math.PI;
  add(sign);
  // brand wall at the back (the hero of the counter shot)
  const brandW = Math.min(W - 1.2, 3.4);
  const brand = new THREE.Mesh(new THREE.PlaneGeometry(brandW, brandW / 4), glowMat(signTex(s), 0.9));
  brand.position.set(X(cx), 2.85, Z(y1 - 0.01));
  brand.rotation.y = Math.PI;
  add(brand);
  // a few metres of brand-coloured wall around it
  slab(colorMat(new THREE.Color(C.primary).getHex(), 0.7), cx - brandW / 2 - 0.4, y1 - 0.03, cx + brandW / 2 + 0.4, y1 - 0.005, 2.2, H, { cast: false });

  // ceiling: recessed downlights on a grid, plus Cycles/3D lights
  const spot = std({ color: 0xffffff, emissive: 0xfff2e0, emissiveIntensity: 4 });
  for (let x = x0 + 0.9; x < x1 - 0.5; x += 1.6) {
    for (let y = y0 + 1.0; y < y1 - 0.4; y += 1.8) {
      add(cyl(0.06, 0.06, 0.012, M.blackMetal, X(x), H - 0.006, Z(y), 20, { cast: false }));
      add(cyl(0.035, 0.035, 0.014, spot, X(x), H - 0.01, Z(y), 16, { cast: false }));
    }
  }
  for (let y = y0 + 2.0; y < y1; y += 3.2) for (const x of W > 4.6 ? [x0 + W * 0.28, x1 - W * 0.28] : [cx]) light(x, y, 55);

  // ---- fit-out per kind ----
  const front = { cafe: cafe, fastfood: fastFood, restaurant: restaurant, fashion: fashion }[s.kind];
  front({ s, M, put, slab, solid, plant, lib, light, add, x0, x1, y0, y1, W, cx, H, C });

  // the shop, split in two zones for the tour and the plan (front by the windows, counter at the back)
  const zone = (name, a, b, type) => {
    const r = [x0, a, x1, b];
    return { type, name, area: +(W * (b - a)).toFixed(1), label: [cx, (a + b) / 2], bbox: r, inner: r, rects: [r], side: type === 'shopFront' ? 'north' : null, fixtures: 0 };
  };
  const rooms = [zone(KIND[s.kind].front, y0, SHOP_SPLIT, 'shopFront'), zone(KIND[s.kind].back, SHOP_SPLIT, y1, 'shopBack')];
  const walls = [[x0 - 0.2, y0, x0, y1], [x1, y0, x1 + 0.2, y1], [x0 - 0.2, y1, x1 + 0.2, y1 + 0.2], [x0, y0 - 0.06, cx - 0.6, y0 + 0.04], [cx + 0.6, y0 - 0.06, x1, y0 + 0.04]];
  const unit = { rects: [[x0, y0, x1, y1]], kind: 'shop', shop: s, code: s.brand, area: +(W * (y1 - y0)).toFixed(1) };
  const sheet = { walls, openings: [{ kind: 'door', rect: [cx - 0.6, y0 - 0.06, cx + 0.6, y0 + 0.04] }], balconies: [], fixtures: [], doorSwings: [], rooms };
  for (const r of rooms) r.unit = unit;
  return { group: merge(g), lights, colliders, wallColliders, rooms, sheet, unit, h: H };
}

// ---------- café: pastry counter, bread wall, banquette and bistro tables ----------
function cafe({ s, M, put, slab, solid, plant, light, add, x0, x1, y0, y1, W, cx, H, C }) {
  const wood = M.walnutVeneer, top = M.marble;
  // counter across the back with a glass pastry case
  const ca = x0 + 0.5, cb = x1 - 1.3, cy0 = y1 - 1.9, cy1 = cy0 + 0.7;
  slab(wood, ca, cy0, cb, cy1, 0, 1.0);
  slab(top, ca - 0.03, cy0 - 0.03, cb + 0.03, cy1 + 0.03, 1.0, 1.04);
  solid(ca, cy0, cb, cy1);
  const caseA = ca + 0.15, caseB = Math.min(cb - 0.6, caseA + 1.8);
  slab(M.glass, caseA, cy0 + 0.05, caseB, cy0 + 0.06, 1.04, 1.5, { cast: false });
  slab(M.glass, caseA, cy0 + 0.06, caseB, cy1 - 0.1, 1.5, 1.51, { cast: false });
  const cakes = [0xe7c9a1, 0x6b3b2a, 0xf2e3cf, 0xc9786b, 0xead27e];
  for (const [i, h] of [[0, 1.06], [1, 1.28]].map(([k, hh]) => [k, hh])) {
    slab(M.steel, caseA + 0.05, cy0 + 0.1, caseB - 0.05, cy1 - 0.12, h, h + 0.01);
    for (let x = caseA + 0.2, k = i; x < caseB - 0.15; x += 0.3, k++) add(cyl(0.11, 0.11, 0.08, colorMat(cakes[k % cakes.length], 0.7), X(x), h + 0.05, Z((cy0 + cy1) / 2 - 0.05), 24));
  }
  // espresso machine and grinder
  slab(M.steel, cb - 0.55, cy0 + 0.2, cb - 0.05, cy1 - 0.05, 1.04, 1.5);
  slab(colorMat(new THREE.Color(C.primary).getHex(), 0.3, 0.4), cb - 0.53, cy0 + 0.18, cb - 0.07, cy0 + 0.2, 1.1, 1.42);
  // bread wall: oak shelves with loaves behind the counter
  for (let h = 0.9; h < 2.2; h += 0.42) {
    slab(M.oakVeneer, x0 + 0.3, y1 - 0.4, x1 - 0.3, y1 - 0.02, h, h + 0.03);
    for (let x = x0 + 0.5; x < x1 - 0.5; x += 0.34) {
      const loaf = mesh(new THREE.CapsuleGeometry(0.07, 0.16, 4, 10), colorMat(0xb07a45, 0.8), { uv: false });
      loaf.rotation.z = Math.PI / 2;
      loaf.position.set(X(x), h + 0.1, Z(y1 - 0.2));
      add(loaf);
    }
  }
  // menu boards above the shelves
  for (const [i, x] of [[0, x0 + 0.9], [1, x1 - 0.9]]) {
    const t = menuTex(s, i ? 'Coffee' : 'Bakery', i ? [['Espresso', '18 000'], ['Cappuccino', '28 000'], ['Latte', '30 000'], ['Green tea', '15 000'], ['Lemonade', '25 000']] : [['Samsa', '12 000'], ['Croissant', '22 000'], ['Napoleon', '28 000'], ['Medovik', '30 000'], ['Non', '8 000']]);
    const b = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.06), glowMat(t, 0.8));
    b.position.set(X(x), 2.6, Z(y1 - 0.01));
    b.rotation.y = Math.PI;
    add(b);
  }
  // banquette along the west wall with marble bistro tables
  const bench = (ya, yb) => {
    slab(M.sofaFabric ?? M.chairFabric, x0 + 0.02, ya, x0 + 0.55, yb, 0.0, 0.45);
    slab(colorMat(new THREE.Color(C.primary).getHex(), 0.85), x0 + 0.02, ya, x0 + 0.16, yb, 0.45, 1.05);
    solid(x0, ya, x0 + 0.55, yb);
  };
  bench(y0 + 0.9, cy0 - 1.2);
  for (let y = y0 + 1.5; y < cy0 - 1.4; y += 1.45) {
    const t = new THREE.Group();
    t.add(cyl(0.35, 0.35, 0.03, top, 0, 0.74, 0, 40));
    t.add(cyl(0.03, 0.03, 0.72, M.brass, 0, 0.37, 0, 12));
    t.add(cyl(0.22, 0.22, 0.02, M.brass, 0, 0.01, 0, 24));
    t.add(cyl(0.04, 0.035, 0.09, colorMat(0xf2efe9, 0.3), 0.08, 0.8, 0.05, 16));
    put(t, x0 + 1.05, y, 'south', { w: 0.7, d: 0.7 });
    put(ST.diningChair(M), x0 + 1.65, y, 'west', { w: 0.42, d: 0.42 });
    if (W > 4.8) {
      put(t.clone(), x1 - 1.3, y + 0.5, 'south', { w: 0.7, d: 0.7 });
      put(ST.diningChair(M), x1 - 1.3, y + 1.0, 'north', { w: 0.42, d: 0.42 });
      put(ST.diningChair(M), x1 - 1.3, y, 'south', { w: 0.42, d: 0.42 });
    }
  }
  // window bar with stools
  slab(M.oakVeneer, x0 + 0.8, y0 + 0.08, x1 - 0.8, y0 + 0.45, 1.05, 1.09);
  for (const x of [x0 + 1.0, x1 - 1.0]) slab(M.blackMetal, x - 0.02, y0 + 0.2, x + 0.02, y0 + 0.24, 0, 1.05);
  solid(x0 + 0.8, y0 + 0.08, x1 - 0.8, y0 + 0.45);
  for (let x = x0 + 1.3; x < x1 - 1.0; x += 0.8) {
    const st = new THREE.Group();
    st.add(cyl(0.18, 0.18, 0.05, M.oakVeneer, 0, 0.75, 0, 24));
    st.add(cyl(0.02, 0.02, 0.73, M.blackMetal, 0, 0.37, 0, 10));
    st.add(cyl(0.16, 0.16, 0.015, M.blackMetal, 0, 0.01, 0, 20));
    put(st, x, y0 + 0.8, 'north', { w: 0.36, d: 0.36 });
  }
  // brass pendants over the tables
  for (let y = y0 + 1.5; y < cy0 - 1.4; y += 1.45) put(Fn.pendant(M, [], H, 1.3), x0 + 1.05, y);
  plant(x1 - 0.4, cy0 - 0.5, 1.4, 1);
  light(cx, cy0 + 0.3, 70);
}

// ---------- fast food: order counter with light-box menus, kiosks, booths ----------
function fastFood({ s, M, put, slab, solid, plant, light, add, x0, x1, y0, y1, W, cx, H, C }) {
  const brandCol = new THREE.Color(C.primary).getHex(), accent = new THREE.Color(C.accent).getHex();
  const cy0 = y1 - 2.2, cy1 = cy0 + 0.75, ca = x0 + 0.4, cb = x1 - 1.2;
  slab(colorMat(brandCol, 0.4), ca, cy0, cb, cy1, 0, 1.05);
  slab(colorMat(accent, 0.4), ca, cy0 - 0.01, cb, cy0, 0.82, 0.9);
  slab(M.quartz ?? M.marble, ca - 0.02, cy0 - 0.05, cb + 0.02, cy1, 1.05, 1.09);
  solid(ca, cy0, cb, cy1);
  for (let x = ca + 0.5; x < cb - 0.3; x += 1.2) slab(colorMat(0x1b1b1b, 0.3), x - 0.17, cy0 + 0.25, x + 0.17, cy0 + 0.3, 1.09, 1.35);
  // kitchen line behind: steel fryers, hood
  slab(M.steel, x0 + 0.3, y1 - 0.8, x1 - 0.3, y1 - 0.05, 0, 0.92);
  slab(M.steel, x0 + 0.3, y1 - 0.9, x1 - 0.3, y1 - 0.05, 2.6, 3.1);
  solid(x0 + 0.3, y1 - 0.8, x1 - 0.3, y1);
  // three light-box menu panels over the counter (facing the customers)
  const menus = [['Lavash', [['Lavash classic', '32 000'], ['Lavash cheese', '36 000'], ['Lavash spicy', '34 000']]], ['Burgers', [['Cheeseburger', '30 000'], ['Double burger', '42 000'], ['Chicken burger', '33 000']]], ['Sides', [['Fries', '14 000'], ['Nuggets', '22 000'], ['Cola', '9 000']]]];
  const mw = Math.min(1.25, (cb - ca) / 3 - 0.1);
  menus.forEach(([title, items], i) => {
    const b = new THREE.Mesh(new THREE.PlaneGeometry(mw, mw * 1.33), glowMat(menuTex(s, title, items), 1.3));
    b.position.set(X(ca + (cb - ca) * ((i + 0.5) / 3)), 2.2, Z(cy0 + 0.3));
    b.rotation.y = Math.PI;
    add(b);
  });
  slab(colorMat(brandCol, 0.4), ca, cy0 + 0.32, cb, cy0 + 0.36, 1.45, 2.95);
  // self-order kiosks near the entrance
  for (const [k, x] of [[0, x0 + 0.5], [1, x0 + 1.15]]) {
    const ks = new THREE.Group();
    ks.add(gbox(0.5, 1.75, 0.08, colorMat(0xf2f2f2, 0.3), 0, 0.875, 0, { r: 0.02 }));
    ks.add(gbox(0.42, 0.75, 0.01, glowMat(menuTex(s, 'Order here', [['Tap to start', ''], ['Pay by card', ''], ['Click / Payme', '']]), 1.2), 0, 1.2, 0.045));
    ks.add(gbox(0.38, 0.05, 0.4, colorMat(0xf2f2f2, 0.3), 0, 0.02, 0.1));
    put(ks, x, y0 + 1.4 + k * 0.05, 'east', { w: 0.5, d: 0.4 });
  }
  // booths along the east wall
  for (let y = y0 + 1.0; y < cy0 - 1.6; y += 1.75) {
    for (const yy of [y, y + 1.15]) slab(colorMat(brandCol, 0.55), x1 - 1.6, yy, x1 - 0.02, yy + 0.5, 0, 0.45);
    for (const yy of [y, y + 1.6]) slab(colorMat(brandCol, 0.55), x1 - 1.6, yy - 0.02, x1 - 0.02, yy + 0.12, 0.45, 1.15);
    slab(colorMat(0xf4f1ea, 0.35), x1 - 1.4, y + 0.55, x1 - 0.05, y + 1.1, 0.72, 0.75);
    slab(M.blackMetal, x1 - 0.8, y + 0.8, x1 - 0.75, y + 0.85, 0, 0.72);
    solid(x1 - 1.6, y, x1, y + 1.65);
  }
  // high tables with stools in the middle
  for (let y = y0 + 1.6; y < cy0 - 1.3; y += 1.6) {
    const t = new THREE.Group();
    t.add(cyl(0.32, 0.32, 0.03, colorMat(0xf4f1ea, 0.35), 0, 1.05, 0, 32));
    t.add(cyl(0.03, 0.03, 1.03, M.blackMetal, 0, 0.52, 0, 10));
    put(t, x0 + 2.4, y, 'south', { w: 0.64, d: 0.64 });
    for (const [dx, f] of [[-0.55, 'east'], [0.55, 'west']]) {
      const st = new THREE.Group();
      st.add(cyl(0.17, 0.17, 0.05, colorMat(accent, 0.5), 0, 0.75, 0, 20));
      st.add(cyl(0.02, 0.02, 0.73, M.blackMetal, 0, 0.37, 0, 10));
      put(st, x0 + 2.4 + dx, y, f, { w: 0.34, d: 0.34 });
    }
  }
  // brand stripe along the west wall
  slab(colorMat(accent, 0.6), x0 + 0.002, y0 + 0.3, x0 + 0.01, cy0 - 0.2, 1.2, 1.35, { cast: false });
  plant(x0 + 0.4, cy0 - 0.6, 1.2, 0);
  light(cx, cy0 - 0.4, 80, 0xfff1df);
}

// ---------- restaurant: banquettes, four-seat tables, ikat wall, tea bar ----------
function restaurant({ s, M, put, slab, solid, plant, light, add, x0, x1, y0, y1, W, cx, H, C }) {
  const blue = new THREE.Color(C.primary).getHex();
  // walnut wainscot with a brass rail on both side walls
  for (const [a, b] of [[x0, x0 + 0.03], [x1 - 0.03, x1]]) {
    slab(M.walnutVeneer, a, y0 + 0.1, b, y1 - 0.1, 0, 1.15, { cast: false });
    slab(M.brass, a - 0.005, y0 + 0.1, b + 0.005, y1 - 0.1, 1.15, 1.17, { cast: false });
  }
  // ikat feature panel on the west wall
  const ikat = texMat(ikatTex('#1d3b5a', '#d8a548', '#a33a2c'), { roughness: 0.85 });
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.9), ikat);
  panel.position.set(X(x0 + 0.035), 2.35, Z(y0 + 3.2));
  panel.rotation.y = Math.PI / 2;
  add(panel);
  slab(M.brass, x0 + 0.03, y0 + 1.55, x0 + 0.05, y0 + 4.85, 1.38, 1.4);
  slab(M.brass, x0 + 0.03, y0 + 1.55, x0 + 0.05, y0 + 4.85, 3.3, 3.32);
  // banquettes along both walls, tables for four
  const fabric = colorMat(blue, 0.85);
  const tableAt = (x, y) => {
    const t = new THREE.Group();
    t.add(gbox(0.8, 0.04, 0.8, M.walnutVeneer, 0, 0.74, 0, { r: 0.01 }));
    t.add(cyl(0.04, 0.04, 0.72, M.blackMetal, 0, 0.36, 0, 12));
    t.add(gbox(0.5, 0.02, 0.5, M.blackMetal, 0, 0.01, 0));
    // tea set: a pot and two bowls (piala)
    t.add(cyl(0.07, 0.06, 0.12, colorMat(0x2c5d8f, 0.25), 0.1, 0.82, 0.05, 20));
    for (const dz of [-0.2, 0.2]) t.add(cyl(0.045, 0.03, 0.05, colorMat(0xf2efe9, 0.25), -0.15, 0.785, dz, 16));
    put(t, x, y, 'south', { w: 0.8, d: 0.8 });
  };
  const rowEnd = y1 - 2.6;
  for (const side of [-1, 1]) {
    const wx = side < 0 ? x0 : x1;
    const ba = side < 0 ? x0 + 0.04 : x1 - 0.6, bb = side < 0 ? x0 + 0.6 : x1 - 0.04;
    slab(fabric, ba, y0 + 0.6, bb, rowEnd, 0, 0.46);
    slab(fabric, side < 0 ? x0 + 0.04 : x1 - 0.2, y0 + 0.6, side < 0 ? x0 + 0.2 : x1 - 0.04, rowEnd, 0.46, 1.1);
    solid(ba, y0 + 0.6, bb, rowEnd);
    for (let y = y0 + 1.2; y < rowEnd - 0.4; y += 1.5) {
      const tx = wx - side * 1.05;
      tableAt(tx, y);
      put(ST.diningChair(M), tx - side * 0.62, y, side < 0 ? 'west' : 'east', { w: 0.42, d: 0.42 });
    }
  }
  // centre tables
  if (W > 5.5) for (let y = y0 + 1.9; y < rowEnd - 0.6; y += 2.0) {
    tableAt(cx, y);
    for (const [dy, f] of [[-0.6, 'south'], [0.6, 'north']]) put(ST.diningChair(M), cx, y + dy, f, { w: 0.42, d: 0.42 });
  }
  // tea bar at the back: walnut counter, shelves of ceramics, a samovar
  const ba = x0 + 0.6, bb = x1 - 0.6, by0 = y1 - 1.6, by1 = by0 + 0.6;
  slab(M.walnutVeneer, ba, by0, bb, by1, 0, 1.05);
  slab(M.marble, ba - 0.03, by0 - 0.03, bb + 0.03, by1 + 0.03, 1.05, 1.09);
  solid(ba, by0, bb, by1);
  const sam = new THREE.Group();
  sam.add(cyl(0.16, 0.2, 0.42, M.brass, 0, 0.21, 0, 28));
  sam.add(cyl(0.08, 0.16, 0.12, M.brass, 0, 0.48, 0, 28));
  sam.add(cyl(0.06, 0.06, 0.1, colorMat(0x2c5d8f, 0.25), 0, 0.6, 0, 20));
  put(sam, ba + 0.5, (by0 + by1) / 2, 'north', { yy: 1.09 });
  for (let h = 1.4; h < 2.6; h += 0.45) {
    slab(M.walnutVeneer, x0 + 0.4, y1 - 0.35, x1 - 0.4, y1 - 0.02, h, h + 0.03);
    for (let x = x0 + 0.6, k = 0; x < x1 - 0.5; x += 0.3, k++) add(cyl(0.07, 0.05, 0.12 + (k % 3) * 0.05, colorMat([0x2c5d8f, 0xf2efe9, 0xb5552f][k % 3], 0.25), X(x), h + 0.1, Z(y1 - 0.18), 16));
  }
  // big brass lanterns
  for (let y = y0 + 1.6; y < rowEnd; y += 2.4) {
    const ln = new THREE.Group();
    ln.add(cyl(0.004, 0.004, 0.9, M.brass, 0, -0.45, 0, 6));
    ln.add(cyl(0.22, 0.16, 0.42, M.brass, 0, -1.1, 0, 12));
    ln.add(cyl(0.18, 0.13, 0.36, std({ color: 0xffd9a0, emissive: 0xffb860, emissiveIntensity: 2.5 }), 0, -1.1, 0, 12));
    put(ln, cx, y, 'south', { yy: H });
  }
  plant(x1 - 0.5, y1 - 2.1, 1.5, 1);
  plant(x0 + 0.5, y1 - 2.1, 1.2, 0);
  light(cx, by0 - 0.3, 70);
}

// ---------- fashion: wall rails with garments, display tables, mannequins, fitting rooms ----------
function fashion({ s, M, put, slab, solid, plant, light, add, x0, x1, y0, y1, W, cx, H, C }) {
  const leather = s.slug === 'kanishka';
  const palette = leather ? [0x3b2a20, 0x6b4a33, 0x9a7352, 0x1d1b19, 0xc49a6c, 0xe6dccd] : [0xf1ece4, 0x8c2f39, 0x2b3a55, 0xd8a548, 0x5f6b62, 0x1d1b19, 0xe2c9b6];
  const rail = (x, face, ya, yb) => {
    // a lit niche: oak back panel, black rail, garments, shelf with folded stacks above
    const inX = face === 'east' ? x + 0.02 : x - 0.02;
    slab(M.oakVeneer, Math.min(x, inX), ya, Math.max(x, inX), yb, 0.2, 2.6, { cast: false });
    const rx = face === 'east' ? x + 0.32 : x - 0.32;
    slab(M.blackMetal, rx - 0.01, ya, rx + 0.01, yb, 1.62, 1.64);
    let k = 0;
    for (let y = ya + 0.1; y < yb - 0.05; y += 0.085, k++) {
      const len = leather && k % 4 === 0 ? 1.0 : 0.72 + (k % 3) * 0.08;
      const gm = gbox(0.48, len, 0.03, colorMat(palette[(k * 5 + (face === 'east' ? 0 : 2)) % palette.length], 0.85), X(rx), 1.6 - len / 2, Z(y));
      add(gm);
    }
    slab(M.oakVeneer, Math.min(x, rx), ya, Math.max(x, rx), yb, 2.1, 2.13);
    for (let y = ya + 0.15, i = 0; y < yb - 0.3; y += 0.38, i++) {
      for (let j = 0; j < 4; j++) slab(colorMat(palette[(i + j) % palette.length], 0.9), Math.min(x, rx) + 0.06, y, Math.max(x, rx) - 0.04, y + 0.3, 2.13 + j * 0.05, 2.175 + j * 0.05);
    }
    solid(Math.min(x, rx) - 0.25, ya, Math.max(x, rx) + 0.25, yb);
  };
  const back = y1 - 1.9;
  rail(x0, 'east', y0 + 1.6, back - 0.3);
  rail(x1, 'west', y0 + 1.6, back - 0.3);
  // display tables in the middle with folded stacks / bags
  for (let y = y0 + 2.2, i = 0; y < back - 1.0; y += 2.1, i++) {
    const t = new THREE.Group();
    t.add(gbox(1.4, 0.05, 0.7, M.oakVeneer, 0, 0.8, 0, { r: 0.01 }));
    for (const sx of [-0.62, 0.62]) t.add(gbox(0.06, 0.78, 0.6, M.oakVeneer, sx, 0.39, 0));
    for (let j = 0; j < 4; j++) {
      const c = colorMat(palette[(i * 3 + j) % palette.length], 0.85);
      if (leather && j % 2) t.add(gbox(0.3, 0.24, 0.12, c, -0.5 + j * 0.33, 0.95, 0, { r: 0.03 }));
      else for (let k = 0; k < 4; k++) t.add(gbox(0.28, 0.035, 0.24, c, -0.5 + j * 0.33, 0.845 + k * 0.038, 0));
    }
    put(t, cx, y, 'south', { w: 1.4, d: 0.7 });
  }
  // mannequins in the window
  const skin = colorMat(0xf2efe9, 0.35);
  for (const [i, x] of [[0, cx - Math.min(1.2, W * 0.25)], [1, cx + Math.min(1.2, W * 0.25)]]) {
    const m = new THREE.Group();
    m.add(cyl(0.18, 0.18, 0.02, M.blackMetal, 0, 0.01, 0, 24));
    m.add(cyl(0.012, 0.012, 0.9, M.blackMetal, 0, 0.45, 0, 8));
    const outfit = colorMat(palette[(i * 3 + 1) % palette.length], 0.85);
    m.add(cyl(0.16, 0.2, 0.62, outfit, 0, 1.05, 0, 20));
    m.add(cyl(0.2, 0.16, 0.42, outfit, 0, 1.56, 0, 20));
    m.add(cyl(0.05, 0.05, 0.1, skin, 0, 1.82, 0, 12));
    m.add(mesh(new THREE.SphereGeometry(0.1, 20, 16), skin, { uv: false }).translateY(1.97));
    put(m, x, y0 + 0.9, 'north', { w: 0.45, d: 0.45 });
  }
  // fitting rooms (west) and cash desk (east) at the back, a full-length mirror between
  const fw = Math.min(2.4, W * 0.45);
  slab(colorMat(0xe9e2d6, 0.9), x0, back + 0.1, x0 + fw, back + 0.14, 0, 2.4);
  slab(colorMat(0xe9e2d6, 0.9), x0 + fw / 2 - 0.02, back + 0.14, x0 + fw / 2 + 0.02, y1, 0, 2.4);
  slab(colorMat(new THREE.Color(C.accent).getHex(), 0.95), x0 + 0.1, back + 0.05, x0 + fw - 0.1, back + 0.08, 0.05, 2.25);
  solid(x0, back + 0.05, x0 + fw, y1);
  const da = x1 - Math.min(2.0, W * 0.4), db = x1 - 0.3;
  slab(M.oakVeneer, da, back + 0.5, db, back + 1.1, 0, 1.0);
  slab(M.marble, da - 0.02, back + 0.48, db + 0.02, back + 1.12, 1.0, 1.04);
  slab(colorMat(0x1b1b1b, 0.3), da + 0.3, back + 0.7, da + 0.65, back + 0.75, 1.04, 1.3);
  solid(da, back + 0.5, db, back + 1.1);
  const mirror = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 2.0), M.mirror);
  mirror.position.set(X(cx + 0.2), 1.1, Z(y1 - 0.02));
  mirror.rotation.y = Math.PI;
  add(mirror);
  plant(x0 + 0.45, y0 + 0.7, 1.3, 0);
  plant(x1 - 0.45, y0 + 0.7, 1.3, 1);
  light(x0 + 0.9, (y0 + back) / 2, 45);
  light(x1 - 0.9, (y0 + back) / 2, 45);
}

// merge static parts into one mesh per material
function merge(group) {
  group.updateMatrixWorld(true);
  const by = new Map();
  group.traverse((o) => {
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
