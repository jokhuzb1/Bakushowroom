// The rest of the residential complex, exterior only, laid out from the aerial renders.
// World coordinates (meters): our block 3A spans x -17.5..17.5, z -9.1..9.1, shops facing -z.
// In the aerials the boulevard runs along -x and the complex extends towards +x and +z.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rand } from '../textures.js';
import { ROOF_Z } from './units.js';

const PODIUM = 4.74;
const BAND_TOPS = [17.2, 32.4]; // tops of floors 5 and 10, where the cornices run on 3A

export const BLOCKS = [
  { name: 'Front-left (corner tower)', rects: [[30, -9.1, 64, 9.1], [46, 9.1, 64, 46]], tower: { x: 64, z: -9.1, r: 7 } },
  { name: 'Centre', rects: [[-10, 22, 36, 40]], domes: [] },
  { name: 'Back-left', rects: [[46, 54, 64, 92], [22, 74, 46, 92]], domes: [[64, 92]] },
  { name: 'Back-right', rects: [[-17.5, 74, 14, 92], [-17.5, 48, 0.5, 74]], domes: [[-17.5, 92]] },
];

// Two floors x two bays of facade (6.08 m x 6.4 m) drawn once and tiled.
export function facadeTexture(variant) {
  const W = 512, H = 512, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const R = rand(31 + variant);
  g.fillStyle = '#dcc6a0';
  g.fillRect(0, 0, W, H);
  for (let fy = 0; fy < 2; fy++) {
    const y0 = fy * 256;
    g.fillStyle = '#e9d9ba'; // floor band
    g.fillRect(0, y0 + 244, W, 12);
    for (let bx = 0; bx < 2; bx++) {
      const x0 = bx * 256;
      g.fillStyle = '#ead9b9'; // pilaster strip
      g.fillRect(x0, y0, 22, 256);
      g.fillStyle = 'rgba(0,0,0,0.08)';
      g.fillRect(x0 + 22, y0, 4, 256);
      const arched = variant === 2 && fy === 0;
      const wx = x0 + 72, ww = 112, wy = y0 + 46, wh = 190;
      // surround
      g.fillStyle = '#efe2c7';
      g.fillRect(wx - 10, wy - 12, ww + 20, wh + 12);
      // window
      const lit = R() > 0.9;
      g.fillStyle = lit ? '#c9a46a' : '#2a3540';
      if (arched) {
        g.beginPath();
        g.moveTo(wx, wy + wh);
        g.lineTo(wx, wy + ww / 2);
        g.arc(wx + ww / 2, wy + ww / 2, ww / 2, Math.PI, 0);
        g.lineTo(wx + ww, wy + wh);
        g.fill();
      } else g.fillRect(wx, wy, ww, wh);
      g.fillStyle = '#3a2d24';
      g.fillRect(wx + ww / 2 - 3, wy + (arched ? ww / 2 : 0), 6, wh - (arched ? ww / 2 : 0));
      g.fillRect(wx, wy + 52, ww, 5);
      // balcony: stone balustrade or iron railing
      const stone = (bx + fy + variant) % 2 === 0;
      if (stone) {
        g.fillStyle = '#f1e5cc';
        g.fillRect(wx - 26, wy + wh - 70, ww + 52, 12);
        g.fillRect(wx - 26, wy + wh - 6, ww + 52, 14);
        for (let k = wx - 20; k < wx + ww + 24; k += 11) g.fillRect(k, wy + wh - 58, 6, 52);
      } else {
        g.fillStyle = '#1f1e1c';
        g.fillRect(wx - 6, wy + wh - 64, ww + 12, 5);
        g.fillRect(wx - 6, wy + wh - 4, ww + 12, 4);
        for (let k = wx - 4; k < wx + ww + 6; k += 9) g.fillRect(k, wy + wh - 60, 3, 58);
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function shopTexture() {
  const W = 256, H = 256, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#d8c39e';
  g.fillRect(0, 0, W, H);
  const glass = g.createLinearGradient(0, 40, 0, 240);
  glass.addColorStop(0, '#b98d55');
  glass.addColorStop(1, '#f0c98a');
  g.fillStyle = glass;
  g.fillRect(40, 70, 176, 170);
  g.fillStyle = '#3a2d24';
  for (const x of [40, 98, 156, 212]) g.fillRect(x, 70, 4, 170);
  g.fillRect(40, 150, 176, 3);
  g.fillStyle = '#1b1712';
  g.fillRect(40, 30, 176, 28); // sign band
  g.fillStyle = '#eee0c4';
  g.fillRect(0, 0, 30, H); g.fillRect(226, 0, 30, H); // columns
  g.fillStyle = '#f5ead3';
  g.fillRect(0, 0, W, 14);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// box whose side faces are mapped in meters: u along the face / uw, v up from `v0` / vh
function mappedBox(x0, y0, z0, x1, y1, z1, uw, vh, v0 = y0) {
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    if (ay > 0.5) { uv.setXY(i, 0.01, 0.01); continue; }
    const u = ax > 0.5 ? p.getZ(i) : p.getX(i);
    uv.setXY(i, u / uw, (p.getY(i) - v0) / vh);
  }
  return g;
}

function mappedCylinder(x, z, r, y0, y1, uw, vh, v0 = y0) {
  const g = new THREE.CylinderGeometry(r, r, y1 - y0, 48, 1, true);
  g.translate(x, (y0 + y1) / 2, z);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    uv.setXY(i, (uv.getX(i) * Math.PI * 2 * r) / uw, (p.getY(i) - v0) / vh);
  }
  return g;
}

export function buildComplex() {
  const root = new THREE.Group();
  root.name = 'complex';
  const std = (p) => new THREE.MeshStandardMaterial(p);
  const M = {
    body: [0, 1, 2].map((v) => std({ name: 'facade', map: facadeTexture(v), roughness: 0.85 })),
    shop: std({ map: shopTexture(), roughness: 0.6, emissive: 0xffc98a, emissiveIntensity: 0.25, emissiveMap: null }),
    trim: std({ color: 0xe8d7b6, roughness: 0.8 }),
    roof: std({ color: 0xb9a596, roughness: 0.95 }),
    terrace: std({ color: 0x8c4333, roughness: 0.75 }),
    solar: std({ color: 0x1b2946, metalness: 0.6, roughness: 0.22 }),
    dome: std({ color: 0x9a3b2c, metalness: 0.3, roughness: 0.45 }),
    glass: std({ name: 'windowGlass', color: 0x33424f, metalness: 0.75, roughness: 0.06 }),
  };
  M.shop.emissiveMap = M.shop.map;
  let parts = new Map();
  const add = (mat, geo) => { if (!parts.has(mat)) parts.set(mat, []); parts.get(mat).push(geo); };
  const box = (mat, x0, y0, z0, x1, y1, z1) => {
    const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    add(mat, g);
  };

  for (const b of BLOCKS) {
    parts = new Map();
    for (const [x0, z0, x1, z1] of b.rects) {
      // shop podium, tower body in three bands so the arched top floors line up with the cornices
      add(M.shop, mappedBox(x0, 0, z0, x1, PODIUM, z1, 3.2, PODIUM));
      const bands = [PODIUM, BAND_TOPS[0], BAND_TOPS[1], ROOF_Z];
      for (let i = 0; i < 3; i++) add(M.body[i], mappedBox(x0, bands[i], z0, x1, bands[i + 1], z1, 6.4, 6.08, bands[i]));
      // cornices: podium, band tops and crown + parapet
      for (const [y, d, h] of [[PODIUM - 0.3, 0.55, 0.32], [BAND_TOPS[0] - 0.3, 0.4, 0.3], [BAND_TOPS[1] - 0.3, 0.4, 0.3], [ROOF_Z - 0.6, 0.65, 0.55]]) {
        box(M.trim, x0 - d, y, z0 - d, x1 + d, y + h, z1 + d);
      }
      box(M.terrace, x0 - 0.55, PODIUM - 0.02, z0 - 0.55, x1 + 0.55, PODIUM + 0.05, z1 + 0.55);
      // roof inside a 1.1 m parapet
      box(M.roof, x0, ROOF_Z - 0.05, z0, x1, ROOF_Z + 0.1, z1);
      box(M.trim, x0 - 0.15, ROOF_Z, z0 - 0.15, x1 + 0.15, ROOF_Z + 1.1, z0 + 0.25);
      box(M.trim, x0 - 0.15, ROOF_Z, z1 - 0.25, x1 + 0.15, ROOF_Z + 1.1, z1 + 0.15);
      box(M.trim, x0 - 0.15, ROOF_Z, z0 - 0.15, x0 + 0.25, ROOF_Z + 1.1, z1 + 0.15);
      box(M.trim, x1 - 0.25, ROOF_Z, z0 - 0.15, x1 + 0.15, ROOF_Z + 1.1, z1 + 0.15);
      // giant-order pilasters every two bays
      for (const [ax, az, bx, bz, nx, nz] of [[x0, z0, x1, z0, 0, -1], [x0, z1, x1, z1, 0, 1], [x0, z0, x0, z1, -1, 0], [x1, z0, x1, z1, 1, 0]]) {
        const len = Math.hypot(bx - ax, bz - az), n = Math.floor(len / 6.4);
        for (let k = 1; k < n; k++) {
          const t = k / n, cx = ax + (bx - ax) * t, cz = az + (bz - az) * t;
          const hw = 0.3;
          const px0 = nx ? cx + Math.min(0, nx * 0.18) : cx - hw, px1 = nx ? cx + Math.max(0, nx * 0.18) : cx + hw;
          const pz0 = nz ? cz + Math.min(0, nz * 0.18) : cz - hw, pz1 = nz ? cz + Math.max(0, nz * 0.18) : cz + hw;
          box(M.trim, px0, PODIUM + 0.3, pz0, px1, ROOF_Z - 0.6, pz1);
        }
      }
      // solar arrays
      for (let x = x0 + 2; x < x1 - 4; x += 6.5) {
        for (let z = z0 + 2; z < z1 - 3; z += 3.2) {
          const p = new THREE.BoxGeometry(5.2, 0.05, 1.7);
          p.rotateX(-0.4);
          p.translate(x + 2.6, ROOF_Z + 0.7, z + 0.9);
          add(M.solar, p);
        }
      }
    }
    for (const [x, z] of b.domes ?? []) addDome(x, z, ROOF_Z + 1.1, 2.4);
    if (b.tower) {
      const { x, z, r } = b.tower;
      add(M.shop, mappedCylinder(x, z, r, 0, PODIUM, 3.2, PODIUM));
      add(M.glass, mappedCylinder(x, z, r - 0.15, PODIUM, ROOF_Z, 6.4, 6.08));
      // stone fins over the curved glazing, like the corner bay in the render
      for (let a = 0; a < 24; a++) {
        const ang = (a / 24) * Math.PI * 2;
        const fin = new THREE.BoxGeometry(0.35, ROOF_Z - PODIUM, 0.5);
        fin.translate(0, (ROOF_Z + PODIUM) / 2, 0);
        fin.rotateY(-ang);
        fin.translate(x + Math.cos(ang) * r, 0, z + Math.sin(ang) * r);
        add(M.trim, fin);
      }
      for (let y = PODIUM + 3.04; y < ROOF_Z; y += 3.04) {
        const ring = new THREE.CylinderGeometry(r + 0.25, r + 0.25, 0.22, 48);
        ring.translate(x, y, z);
        add(M.trim, ring);
      }
      const cap = new THREE.CylinderGeometry(r + 0.7, r + 0.7, 0.6, 48);
      cap.translate(x, ROOF_Z, z);
      add(M.trim, cap);
      addDome(x, z, ROOF_Z + 0.3, 3.2);
    }
    // one group per block, so the Showcase can move each out of the way
    const group = new THREE.Group();
    for (const [mat, list] of parts) {
      // drop uv-less pieces into a consistent attribute set before merging
      const m = new THREE.Mesh(mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g))), mat);
      m.castShadow = true;
      m.receiveShadow = true;
      group.add(m);
    }
    const boxes = b.rects.map((r) => [...r]);
    if (b.tower) boxes.push([b.tower.x - b.tower.r, b.tower.z - b.tower.r, b.tower.x + b.tower.r, b.tower.z + b.tower.r]);
    group.userData.block = { boxes, h: ROOF_Z + 7 };
    root.add(group);
  }

  function addDome(x, z, y, r) {
    const drum = new THREE.CylinderGeometry(r * 0.92, r * 0.92, r * 0.9, 32);
    drum.translate(x, y + r * 0.45, z);
    add(M.trim, drum);
    const cap = new THREE.SphereGeometry(r, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    cap.translate(x, y + r * 0.9, z);
    add(M.dome, cap);
    const fin = new THREE.ConeGeometry(0.12, 1.2, 8);
    fin.translate(x, y + r * 1.9 + 0.5, z);
    add(M.trim, fin);
  }

  return root;
}
