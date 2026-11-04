// Parametric furniture. Every piece is a THREE.Group sitting on the floor at its origin,
// front facing local +z. Materials come from the style kit, so a kit swap restyles everything.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { box, cyl, mesh, group } from './geo.js';

const leafGeo = new THREE.SphereGeometry(1, 10, 6);
const sphere = (r, mat, x, y, z) => { const m = mesh(new THREE.SphereGeometry(r, 20, 14), mat, { uv: false }); m.position.set(x, y, z); return m; };
const warm = new THREE.Color(0xffd2a1);

function pointLight(intensity, distance, x, y, z) {
  const l = new THREE.PointLight(warm, intensity * 0.35, distance, 2);
  l.position.set(x, y, z);
  l.userData.lamp = true;
  return l;
}

export function sofa(M, w = 2.3) {
  const g = new THREE.Group(), f = M.sofaFabric, d = 0.95;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(0.018, 0.014, 0.1, M.walnut, sx * (w / 2 - 0.08), 0.05, sz * (d / 2 - 0.08), 12));
  g.add(box(w, 0.2, d - 0.04, f, 0, 0.2, 0, { r: 0.03 }));
  for (const s of [-1, 1]) g.add(box(0.2, 0.52, d, f, s * (w / 2 - 0.1), 0.36, 0, { r: 0.08, seg: 5 }));
  g.add(box(w - 0.36, 0.72, 0.18, f, 0, 0.46, -(d / 2 - 0.09), { r: 0.06 }));
  const n = 3, cw = (w - 0.4) / n;
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + 0.2 + cw * (i + 0.5);
    const seat = mesh(pillowGeo(cw - 0.012, 0.16, 0.66, 0.25), f, { offset: [i * 0.3, 0] });
    seat.position.set(x, 0.385, 0.07);
    g.add(seat);
    const b = mesh(pillowGeo(cw - 0.02, 0.2, 0.46, 0.35), f, { offset: [i * 0.37, 0] });
    b.position.set(x, 0.7, -0.27);
    b.rotation.x = -Math.PI / 2 + 0.0;
    b.rotation.x = -Math.PI / 2 - 0.12;
    g.add(b);
  }
  [[-1, M.linenSand], [1, M.throwRust]].forEach(([s, mat]) => {
    const p = mesh(pillowGeo(0.44, 0.13, 0.44, 0.6), mat);
    p.position.set(s * (w / 2 - 0.45), 0.67, -0.1);
    p.rotation.set(-Math.PI / 2 - 0.25, 0, s * -0.12);
    g.add(p);
  });
  return g;
}

export function coffeeTable(M) {
  const g = new THREE.Group();
  g.add(box(1.1, 0.04, 0.6, M.oakWood, 0, 0.38, 0, { r: 0.012 }));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(0.012, 0.012, 0.36, M.blackMetal, sx * 0.48, 0.18, sz * 0.24, 10));
  g.add(box(0.26, 0.035, 0.19, M.book2, -0.25, 0.418, 0.05, { r: 0.004 }));
  g.add(box(0.23, 0.03, 0.17, M.book3, -0.24, 0.45, 0.05, { r: 0.004 }));
  g.add(cyl(0.06, 0.045, 0.2, M.ceramic, 0.28, 0.5, -0.05, 24));
  for (let i = 0; i < 3; i++) {
    const s = cyl(0.003, 0.003, 0.35, M.walnut, 0.28 + (i - 1) * 0.02, 0.72, -0.05, 6);
    s.rotation.z = (i - 1) * 0.25;
    g.add(s);
  }
  return g;
}

export function tvUnit(M, w = 1.9) {
  const g = new THREE.Group();
  g.add(box(w, 0.4, 0.42, M.walnut, 0, 0.4, 0, { r: 0.006 }));
  const n = 3, dw = (w - 0.01) / n;
  for (let i = 0; i < n; i++) g.add(box(dw - 0.005, 0.38, 0.015, M.walnut, -w / 2 + 0.005 + dw * (i + 0.5), 0.4, 0.215, { offset: [i * 0.4, 0.2] }));
  g.add(box(1.46, 0.84, 0.03, M.screen, 0, 1.38, -0.16));
  g.add(box(1.47, 0.85, 0.02, M.blackMetal, 0, 1.38, -0.18));
  g.add(cyl(0.05, 0.07, 0.24, M.terracotta, 0.7, 0.72, 0.02, 24));
  g.add(box(0.3, 0.04, 0.22, M.book1, -0.6, 0.62, 0.02, { r: 0.004 }));
  return g;
}

export function rug(M, w, d) {
  const g = new THREE.Group();
  const geo = new THREE.PlaneGeometry(w, d);
  geo.rotateX(-Math.PI / 2);
  const m = mesh(geo, M.rug, { uv: false, cast: false });
  m.position.y = 0.008;
  g.add(m);
  g.add(box(w, 0.008, d, M.linenSand, 0, 0.004, 0, { cast: false }));
  return g;
}

export function floorLamp(M, lights) {
  const g = new THREE.Group();
  g.add(cyl(0.15, 0.15, 0.02, M.blackMetal, 0, 0.01, 0, 32));
  g.add(cyl(0.011, 0.011, 1.5, M.brass, 0, 0.76, 0, 12));
  g.add(mesh(new THREE.CylinderGeometry(0.19, 0.23, 0.3, 40, 1, true), M.lampShade, { uv: false }).translateY(1.58));
  g.add(sphere(0.035, M.bulb, 0, 1.5, 0));
  const l = pointLight(1.2, 6, 0, 1.5, 0);
  g.add(l); lights.push(l);
  return g;
}

export function plant(M, h = 1.6, kind = 'fiddle', pot = 'white', seed = 1) {
  const g = new THREE.Group();
  let s = seed * 9973;
  const R = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const pr = kind === 'fiddle' ? 0.2 : 0.14, ph = kind === 'fiddle' ? 0.42 : 0.3;
  g.add(cyl(pr, pr * 0.8, ph, pot === 'white' ? M.potWhite : M.terracotta, 0, ph / 2, 0, 32));
  g.add(cyl(pr * 0.92, pr * 0.92, 0.01, M.soil, 0, ph - 0.03, 0, 24, { cast: false }));
  const leaf = (x, y, z, sx, sy, sz, ry, rx) => {
    const m = mesh(leafGeo, R() > 0.5 ? M.leaf : M.leafDark, { uv: false });
    m.scale.set(sx, sy, sz);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, 0, 'YXZ');
    g.add(m);
  };
  if (kind === 'fiddle') {
    g.add(cyl(0.012, 0.018, h * 0.75, M.walnut, 0, ph + h * 0.37, 0, 8));
    for (let i = 0; i < 34; i++) {
      const t = R(), a = R() * Math.PI * 2, rad = 0.06 + R() * 0.2;
      const y = ph + h * (0.35 + t * 0.62);
      leaf(Math.cos(a) * rad, y, Math.sin(a) * rad, 0.12 + R() * 0.04, 0.007, 0.085, -a, -0.4 + R() * 0.6);
    }
  } else if (kind === 'snake') {
    for (let i = 0; i < 14; i++) {
      const a = R() * Math.PI * 2, rad = R() * 0.07, hh = h * (0.5 + R() * 0.5);
      const m = mesh(leafGeo, R() > 0.4 ? M.leaf : M.leafDark, { uv: false });
      m.scale.set(0.035, hh / 2, 0.006);
      m.position.set(Math.cos(a) * rad, ph + hh / 2 - 0.04, Math.sin(a) * rad);
      m.rotation.set((R() - 0.5) * 0.3, R() * Math.PI, (R() - 0.5) * 0.3);
      g.add(m);
    }
  } else {
    for (let i = 0; i < 60; i++) {
      const a = R() * Math.PI * 2, el = R() * 1.2, rad = 0.12 + R() * 0.12;
      leaf(Math.cos(a) * Math.cos(el) * rad, ph + 0.12 + Math.sin(el) * rad * 1.2, Math.sin(a) * Math.cos(el) * rad, 0.07, 0.006, 0.045, -a, -0.3 - R() * 0.6);
    }
  }
  return g;
}

export function diningTable(M) {
  const g = new THREE.Group();
  g.add(box(1.6, 0.035, 0.9, M.oakWood, 0, 0.7425, 0, { r: 0.01 }));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.04, 0.725, 0.04, M.blackMetal, sx * 0.7, 0.3625, sz * 0.36));
  g.add(cyl(0.12, 0.09, 0.07, M.ceramic, 0.1, 0.795, 0, 32));
  for (let i = 0; i < 3; i++) g.add(sphere(0.035, i === 1 ? M.terracotta : M.brass, 0.06 + i * 0.04, 0.82, (i - 1) * 0.03));
  return g;
}

export function diningChair(M) {
  const g = new THREE.Group();
  g.add(box(0.46, 0.05, 0.46, M.chairFabric, 0, 0.465, 0, { r: 0.02 }));
  const b = box(0.44, 0.36, 0.04, M.oakWood, 0, 0.7, -0.21, { r: 0.015 });
  b.rotation.x = -0.08;
  g.add(b);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(0.015, 0.012, 0.44, M.oakWood, sx * 0.19, 0.22, sz * 0.19, 10));
  for (const sx of [-1, 1]) g.add(cyl(0.012, 0.012, 0.3, M.oakWood, sx * 0.19, 0.6, -0.2, 8));
  return g;
}

export function pendant(M, lights, ceilY, drop) {
  const g = new THREE.Group();
  const shadeMat = M.blackMetal.clone(); shadeMat.side = THREE.DoubleSide;
  const y = ceilY - drop;
  g.add(cyl(0.003, 0.003, drop, M.blackMetal, 0, ceilY - drop / 2, 0, 6));
  g.add(cyl(0.05, 0.05, 0.02, M.blackMetal, 0, ceilY - 0.01, 0, 20));
  g.add(mesh(new THREE.CylinderGeometry(0.05, 0.24, 0.22, 48, 1, true), shadeMat, { uv: false }).translateY(y - 0.11));
  g.add(sphere(0.05, M.bulb, 0, y - 0.18, 0));
  const l = pointLight(2.2, 6, 0, y - 0.25, 0);
  g.add(l); lights.push(l);
  return g;
}

export function kitchenRun(M, len, { sink, cooktop, upper = true } = {}) {
  const g = new THREE.Group();
  g.add(box(len, 0.1, 0.5, M.blackMetal, 0, 0.05, -0.05));
  g.add(box(len, 0.78, 0.58, M.whiteMatte, 0, 0.49, -0.01));
  const n = Math.max(1, Math.round(len / 0.6)), dw = len / n;
  for (let i = 0; i < n; i++) {
    const x = -len / 2 + dw * (i + 0.5);
    g.add(box(dw - 0.004, 0.76, 0.02, M.cabinetGreen, x, 0.49, 0.29));
    g.add(box(0.22, 0.012, 0.016, M.brass, x, 0.83, 0.31, { r: 0.005 }));
  }
  g.add(box(len, 0.03, 0.62, M.marble, 0, 0.895, 0.005));
  g.add(box(len, 0.6, 0.015, M.marble, 0, 1.21, -0.2925, { offset: [0.3, 0.1] }));
  if (upper) {
    g.add(box(len, 0.72, 0.34, M.whiteMatte, 0, 1.87, -0.13));
    for (let i = 0; i < n; i++) g.add(box(dw - 0.004, 0.7, 0.018, M.oakWood, -len / 2 + dw * (i + 0.5), 1.87, 0.049, { offset: [i * 0.31, 0] }));
    g.add(box(len - 0.06, 0.008, 0.03, M.led, 0, 1.506, -0.02, { cast: false }));
  }
  if (sink !== undefined) {
    g.add(box(0.6, 0.004, 0.44, M.steel, sink, 0.912, 0.02));
    g.add(box(0.52, 0.002, 0.36, M.blackMetal, sink, 0.9145, 0.02));
    g.add(cyl(0.022, 0.026, 0.07, M.blackMetal, sink, 0.945, -0.2, 16));
    const spout = mesh(new THREE.TorusGeometry(0.1, 0.011, 10, 24, Math.PI), M.blackMetal, { uv: false });
    spout.rotation.y = Math.PI / 2;
    spout.position.set(sink, 0.98, -0.1);
    g.add(spout);
  }
  if (cooktop !== undefined) {
    g.add(box(0.6, 0.006, 0.52, M.cooktop, cooktop, 0.913, 0.02));
    for (const [dx, dz, r] of [[-0.15, -0.1, 0.09], [0.15, -0.1, 0.07], [-0.15, 0.13, 0.07], [0.15, 0.13, 0.09]]) {
      const ring = mesh(new THREE.TorusGeometry(r, 0.0025, 4, 40), M.steel, { uv: false, cast: false });
      ring.rotation.x = Math.PI / 2;
      ring.position.set(cooktop + dx, 0.917, 0.02 + dz);
      g.add(ring);
    }
    // board, bowl and oil bottle: lived-in detail
    g.add(box(0.4, 0.02, 0.28, M.oakWood, cooktop + 0.75, 0.92, -0.05, { r: 0.006 }));
    g.add(cyl(0.03, 0.03, 0.22, M.glass, cooktop - 0.6, 1.02, -0.2, 16));
  }
  return g;
}

export function tallUnit(M) {
  const g = new THREE.Group();
  g.add(box(0.6, 2.3, 0.6, M.whiteMatte, 0, 1.15, -0.01));
  g.add(box(0.596, 1.38, 0.02, M.cabinetGreen, 0, 0.8, 0.3));
  g.add(box(0.596, 0.8, 0.02, M.cabinetGreen, 0, 1.894, 0.3));
  g.add(box(0.014, 0.5, 0.016, M.brass, -0.25, 1.2, 0.32, { r: 0.006 }));
  g.add(box(0.014, 0.3, 0.016, M.brass, -0.25, 1.65, 0.32, { r: 0.006 }));
  return g;
}

// Soft goods: a cushion/pillow is a rounded box whose faces bulge outwards (plump, not boxy).
export function pillowGeo(w, h, d, bulge = 0.35, seg = 5) {
  const geo = new RoundedBoxGeometry(w, h, d, seg, Math.min(h, w, d) * 0.45);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / (w / 2), y = p.getY(i) / (h / 2), z = p.getZ(i) / (d / 2);
    const k = Math.max(0, 1 - x * x) * Math.max(0, 1 - z * z);
    p.setY(i, p.getY(i) * (1 + bulge * k));
  }
  geo.computeVertexNormals();
  return geo;
}

// Duvet draped over a mattress: flat, slightly domed top with soft wrinkles, falling down the sides and foot.
function duvetGeo(w, l, drop, seed = 1) {
  const sx = 36, sz = 28;
  const geo = new THREE.PlaneGeometry(w + 2 * drop, l + drop, sx, sz).rotateX(-Math.PI / 2);
  geo.translate(0, 0, drop / 2);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const ex = Math.max(0, Math.abs(x) - w / 2), ez = Math.max(0, z - l / 2);
    const e = Math.hypot(ex, ez);
    const wr = 0.006 * Math.sin(x * 21 + z * 6 + seed) + 0.004 * Math.sin(z * 29 - x * 9) + 0.003 * Math.sin(x * 47 + z * 13);
    if (e > 0) {
      // over the edge: hang down with a soft outward belly
      const t = Math.min(1, e / drop);
      const belly = 0.035 * Math.sin(t * Math.PI);
      const nx = ex > 0 ? Math.sign(x) * (w / 2 + belly) : x;
      const nz = ez > 0 ? l / 2 + belly : z;
      p.setXYZ(i, nx + (ex > 0 ? wr * 0.6 : 0), -e * 0.97 + wr, nz);
    } else {
      const dome = 0.04 * Math.sqrt(Math.max(0, 1 - (x / (w / 2)) ** 2)) * Math.min(1, (l / 2 - z) / 0.25);
      p.setY(i, dome + wr);
    }
  }
  geo.computeVertexNormals();
  return geo;
}

export function bed(M, w = 1.6, l = 2.1) {
  const g = new THREE.Group();
  // low upholstered base on recessed plinth
  g.add(box(w - 0.1, 0.08, l - 0.1, M.blackMetal, 0, 0.04, 0));
  g.add(box(w + 0.06, 0.26, l + 0.02, M.headboard, 0, 0.21, 0, { r: 0.04, seg: 4 }));
  // mattress
  g.add(box(w, 0.24, l - 0.04, M.linenWhite, 0, 0.46, 0.0, { r: 0.07, seg: 4 }));
  const top = 0.585;
  // duvet: covers the lower 72%, turned down at the top in a soft roll
  const dl = l * 0.72, z0 = l / 2 - dl;
  const duvet = mesh(duvetGeo(w + 0.02, dl, 0.28, w), M.linenWhite);
  duvet.position.set(0, top, z0 + dl / 2 - 0.0);
  g.add(duvet);
  const roll = mesh(pillowGeo(w + 0.08, 0.075, 0.24, 0.25), M.linenWhite);
  roll.position.set(0, top + 0.04, z0 + 0.08);
  g.add(roll);
  // throw across the foot
  const throwG = mesh(duvetGeo(w + 0.06, 0.5, 0.2, 7), M.throwRust);
  throwG.position.set(0, top + 0.035, l / 2 - 0.25);
  g.add(throwG);
  // pillows: two sleeping pillows leaning on the headboard, two decorative in front
  for (const sgn of [-1, 1]) {
    const p = mesh(pillowGeo(w / 2 - 0.08, 0.16, 0.5, 0.55), M.linenWhite);
    p.position.set(sgn * (w / 4), top + 0.12, -l / 2 + 0.3);
    p.rotation.set(-1.05, 0, sgn * 0.03);
    g.add(p);
    const q = mesh(pillowGeo(w / 2 - 0.24, 0.13, 0.42, 0.6), M.linenSand);
    q.position.set(sgn * (w / 4 - 0.03), top + 0.13, -l / 2 + 0.47);
    q.rotation.set(-1.15, 0, sgn * 0.08);
    g.add(q);
  }
  // tall upholstered headboard with vertical channels
  const hw = w + 0.26;
  g.add(box(hw, 1.1, 0.08, M.headboard, 0, 0.6, -l / 2 - 0.07, { r: 0.03, seg: 4 }));
  const k = Math.round(hw / 0.2), cw = hw / k;
  for (let i = 0; i < k; i++) {
    const c = mesh(pillowGeo(cw - 0.01, 1.0, 0.07, 0.15, 4), M.headboard, { offset: [i * 0.13, 0] });
    c.position.set(-hw / 2 + cw * (i + 0.5), 0.62, -l / 2 - 0.02);
    g.add(c);
  }
  return g;
}

export function nightstand(M, mat) {
  const g = new THREE.Group();
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(0.01, 0.01, 0.16, M.blackMetal, sx * 0.19, 0.08, sz * 0.15, 8));
  g.add(box(0.46, 0.38, 0.4, mat ?? M.oakWood, 0, 0.35, 0, { r: 0.008 }));
  g.add(box(0.44, 0.004, 0.004, M.blackMetal, 0, 0.42, 0.201));
  g.add(box(0.1, 0.012, 0.014, M.brass, 0, 0.47, 0.21, { r: 0.005 }));
  return g;
}

export function tableLamp(M, lights) {
  const g = new THREE.Group();
  g.add(sphere(0.09, M.ceramic, 0, 0.09, 0));
  g.add(cyl(0.008, 0.008, 0.16, M.brass, 0, 0.24, 0, 8));
  g.add(mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.2, 40, 1, true), M.lampShade, { uv: false }).translateY(0.36));
  g.add(sphere(0.025, M.bulb, 0, 0.32, 0));
  const l = pointLight(0.6, 4, 0, 0.32, 0);
  g.add(l); lights.push(l);
  return g;
}

export function wardrobe(M, w, front, h = 2.4) {
  const g = new THREE.Group();
  g.add(box(w, h, 0.6, M.whiteMatte, 0, h / 2, 0));
  const n = Math.max(2, Math.round(w / 0.55)), dw = w / n;
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + dw * (i + 0.5);
    g.add(box(dw - 0.004, h - 0.04, 0.02, front, x, h / 2, 0.31, { offset: [i * 0.27, 0] }));
    const side = i % 2 === 0 ? 1 : -1;
    g.add(box(0.012, 0.45, 0.018, M.blackMetal, x + side * (dw / 2 - 0.05), 1.05, 0.33, { r: 0.005 }));
  }
  return g;
}

export function armchair(M) {
  const g = new THREE.Group();
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(0.018, 0.012, 0.16, M.oakWood, sx * 0.3, 0.08, sz * 0.3, 10));
  g.add(box(0.78, 0.22, 0.78, M.chairFabric, 0, 0.27, 0, { r: 0.05 }));
  g.add(box(0.56, 0.12, 0.6, M.chairFabric, 0, 0.42, 0.06, { r: 0.05 }));
  const b = box(0.78, 0.48, 0.16, M.chairFabric, 0, 0.6, -0.31, { r: 0.07 });
  b.rotation.x = -0.14;
  g.add(b);
  for (const s of [-1, 1]) g.add(box(0.13, 0.24, 0.74, M.chairFabric, s * 0.325, 0.5, 0, { r: 0.05 }));
  g.add(box(0.5, 0.02, 0.4, M.throwRust, 0.05, 0.49, 0.1, { r: 0.008 }));
  return g;
}

export function sideTable(M) {
  const g = new THREE.Group();
  g.add(cyl(0.22, 0.22, 0.025, M.walnut, 0, 0.52, 0, 40));
  g.add(cyl(0.015, 0.015, 0.5, M.blackMetal, 0, 0.26, 0, 10));
  g.add(cyl(0.16, 0.16, 0.015, M.blackMetal, 0, 0.0075, 0, 32));
  g.add(cyl(0.05, 0.05, 0.1, M.ceramic, 0.06, 0.585, 0, 20));
  return g;
}

export function desk(M, lights, w = 1.4) {
  const g = new THREE.Group();
  g.add(box(w, 0.03, 0.6, M.oakWood, 0, 0.745, 0, { r: 0.006 }));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.03, 0.73, 0.03, M.blackMetal, sx * (w / 2 - 0.05), 0.365, sz * 0.25));
  g.add(box(0.32, 0.012, 0.22, M.steel, 0.1, 0.766, 0.05, { r: 0.004 }));
  const scr = box(0.32, 0.21, 0.006, M.steel, 0.1, 0.87, -0.065);
  scr.rotation.x = -0.25;
  g.add(scr);
  g.add(box(0.06, 0.24, 0.2, M.book1, -0.55, 0.88, -0.18));
  g.add(box(0.05, 0.22, 0.19, M.book2, -0.49, 0.87, -0.18));
  g.add(box(0.07, 0.25, 0.2, M.book3, -0.43, 0.885, -0.18));
  g.add(cyl(0.07, 0.07, 0.015, M.blackMetal, 0.55, 0.768, -0.15, 24));
  g.add(cyl(0.008, 0.008, 0.4, M.blackMetal, 0.55, 0.96, -0.15, 8));
  g.add(mesh(new THREE.CylinderGeometry(0.03, 0.08, 0.12, 24, 1, true), M.lampShade, { uv: false }).translateX(0.5).translateY(1.12).translateZ(-0.1));
  const l = pointLight(0.4, 3, 0.5, 1.08, -0.1);
  g.add(l); lights.push(l);
  return g;
}

export function art(M, w, h, variant = 0) {
  const g = new THREE.Group();
  g.add(box(w, h, 0.03, M.frameBlack ?? M.walnut, 0, 0, 0.015));
  if (M.artworks) {
    // printed abstract canvas: UVs span the canvas exactly once
    const c = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.05, h - 0.05), M.artworks[variant % M.artworks.length]);
    c.position.z = 0.032;
    g.add(c);
    return g;
  }
  g.add(box(w - 0.05, h - 0.05, 0.004, M.canvas, 0, 0, 0.031));
  if (variant === 0) {
    g.add(cyl(h * 0.25, h * 0.25, 0.004, M.art1, -w * 0.12, h * 0.05, 0.034, 48).rotateX(Math.PI / 2));
    g.add(box(w * 0.35, h * 0.5, 0.004, M.art2, w * 0.15, -h * 0.08, 0.035));
  } else {
    for (let i = 0; i < 4; i++) g.add(box(w * 0.12, h * (0.3 + i * 0.12), 0.004, i % 2 ? M.art1 : M.art2, -w * 0.25 + i * w * 0.16, -h * 0.1, 0.034));
  }
  return g;
}

export function roundMirror(M, r) {
  const g = new THREE.Group();
  g.add(cyl(r, r, 0.02, M.brass, 0, 0, 0.01, 64).rotateX(Math.PI / 2));
  g.add(cyl(r - 0.015, r - 0.015, 0.022, M.mirror, 0, 0, 0.012, 64).rotateX(Math.PI / 2));
  return g;
}

export function consoleCabinet(M, w) {
  const g = new THREE.Group();
  g.add(box(w, 0.42, 0.34, M.walnut, 0, 0.55, 0, { r: 0.006 }));
  g.add(box(w - 0.02, 0.004, 0.004, M.blackMetal, 0, 0.55, 0.171));
  g.add(cyl(0.11, 0.07, 0.06, M.ceramic, -w * 0.25, 0.79, 0.02, 32));
  g.add(cyl(0.05, 0.07, 0.3, M.terracotta, w * 0.3, 0.91, -0.02, 24));
  for (let i = 0; i < 4; i++) {
    const s = cyl(0.003, 0.003, 0.55, M.walnut, w * 0.3, 1.25, -0.02, 6);
    s.rotation.set((i - 1.5) * 0.12, 0, (i - 1.5) * 0.16);
    g.add(s);
  }
  return g;
}

export function bathtub(M) {
  const g = new THREE.Group(), L = 1.7, W = 0.75, H = 0.56, t = 0.07;
  for (const s of [-1, 1]) g.add(box(L, H, t, M.ceramic, 0, H / 2, s * (W / 2 - t / 2), { r: 0.03 }));
  for (const s of [-1, 1]) g.add(box(t, H, W - 0.1, M.ceramic, s * (L / 2 - t / 2), H / 2, 0, { r: 0.03 }));
  g.add(box(L - 0.1, 0.12, W - 0.1, M.ceramic, 0, 0.06, 0, { r: 0.04 }));
  return g;
}

export function toilet(M) {
  const g = new THREE.Group();
  g.add(box(0.6, 1.1, 0.14, M.wallTile, 0, 0.55, 0.07));
  g.add(box(0.6, 0.02, 0.16, M.marble, 0, 1.11, 0.075));
  g.add(box(0.36, 0.32, 0.52, M.ceramic, 0, 0.42, 0.4, { r: 0.13 }));
  g.add(box(0.37, 0.03, 0.46, M.ceramic, 0, 0.59, 0.42, { r: 0.12 }));
  g.add(box(0.22, 0.15, 0.01, M.chrome, 0, 0.95, 0.145, { r: 0.004 }));
  return g;
}

export function vanity(M, w = 1.2) {
  const g = new THREE.Group();
  g.add(box(w, 0.45, 0.48, M.oakWood, 0, 0.625, 0.24, { r: 0.006 }));
  g.add(box(w - 0.02, 0.004, 0.004, M.blackMetal, 0, 0.65, 0.481));
  g.add(box(w, 0.03, 0.5, M.marble, 0, 0.865, 0.25));
  g.add(box(0.5, 0.13, 0.38, M.ceramic, 0, 0.945, 0.27, { r: 0.05 }));
  g.add(box(0.44, 0.005, 0.32, M.blackMetal, 0, 1.009, 0.27));
  g.add(cyl(0.012, 0.012, 0.3, M.blackMetal, 0, 1.03, 0.04, 12));
  g.add(box(0.025, 0.02, 0.16, M.blackMetal, 0, 1.17, 0.11, { r: 0.008 }));
  g.add(box(0.9, 0.8, 0.02, M.mirror, 0, 1.6, 0.025));
  g.add(box(0.94, 0.84, 0.006, M.led, 0, 1.6, 0.008, { cast: false }));
  g.add(cyl(0.035, 0.035, 0.16, M.potWhite, w / 2 - 0.12, 0.96, 0.15, 16));
  return g;
}

export function shower(M) {
  // glass screen + rain head; the floor is the room's stone
  const g = new THREE.Group();
  g.add(box(0.012, 2.0, 0.9, M.glass, 0, 1.0, 0, { cast: false }));
  g.add(box(0.02, 0.02, 0.9, M.blackMetal, 0, 2.0, 0));
  g.add(box(0.02, 2.0, 0.02, M.blackMetal, 0, 1.0, -0.45));
  g.add(box(0.02, 0.02, 0.6, M.blackMetal, 0, 1.0, 0.0));
  return g;
}

export function towelLadder(M) {
  const g = new THREE.Group();
  for (const s of [-1, 1]) g.add(cyl(0.012, 0.012, 1.6, M.blackMetal, s * 0.22, 0.8, 0.05, 10));
  for (let i = 0; i < 4; i++) g.add(cyl(0.008, 0.008, 0.44, M.blackMetal, 0, 0.5 + i * 0.3, 0.05, 8).rotateZ(Math.PI / 2));
  g.add(box(0.36, 0.5, 0.03, M.towel, 0, 1.15, 0.065, { r: 0.012 }));
  g.add(box(0.3, 0.3, 0.03, M.linenSand, 0, 0.65, 0.07, { r: 0.012 }));
  return g;
}

export function bistroSet(M) {
  const g = new THREE.Group();
  g.add(cyl(0.3, 0.3, 0.02, M.marble, 0, 0.72, 0, 48));
  g.add(cyl(0.02, 0.02, 0.7, M.blackMetal, 0, 0.36, 0, 10));
  g.add(cyl(0.2, 0.2, 0.015, M.blackMetal, 0, 0.0075, 0, 32));
  g.add(cyl(0.04, 0.03, 0.09, M.ceramic, 0.1, 0.775, 0.05, 16));
  for (const s of [-1, 1]) {
    const c = new THREE.Group();
    c.add(box(0.42, 0.025, 0.42, M.blackMetal, 0, 0.46, 0, { r: 0.008 }));
    c.add(box(0.42, 0.3, 0.02, M.blackMetal, 0, 0.66, -0.2, { r: 0.008 }));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) c.add(cyl(0.01, 0.01, 0.46, M.blackMetal, sx * 0.18, 0.23, sz * 0.18, 8));
    c.add(box(0.38, 0.04, 0.38, M.linenSand, 0, 0.49, 0.01, { r: 0.015 }));
    c.position.x = s * 0.55;
    c.rotation.y = -s * Math.PI / 2;
    g.add(c);
  }
  return g;
}

// ---------- layout ----------
// Furniture placement per room (world coordinates on the plan). Pieces marked solid become walk colliders.
export function furnish(M, unit) {
  const H = unit.height;
  const root = new THREE.Group();
  const lights = [];
  const solids = [];
  const put = (obj, x, z, rotY = 0, solid = true, y = 0) => {
    const g = group(x, y, z, rotY, obj);
    root.add(g);
    if (solid) solids.push(g);
    return g;
  };
  const E = Math.PI / 2; // face +x

  // living & kitchen
  put(rug(M, 2.6, 2.2), 4.55, 1.9, 0, false);
  put(sofa(M, 2.3), 3.75, 1.9, E);
  put(coffeeTable(M), 4.85, 1.9, E);
  put(tvUnit(M), 5.73, 1.9, -E);
  put(floorLamp(M, lights), 3.55, 0.5, 0, false);
  put(plant(M, 1.5, 'fiddle', 'white', 3), 5.6, 0.55);
  put(diningTable(M), 1.55, 1.45);
  for (const x of [1.15, 1.95]) { put(diningChair(M), x, 0.62, 0); put(diningChair(M), x, 2.28, Math.PI); }
  put(pendant(M, lights, H, 1.15), 1.55, 1.45, 0, false);
  put(kitchenRun(M, 1.14, { sink: 0 }), 0.425, 3.37, E);
  put(kitchenRun(M, 1.875, { cooktop: -0.1 }), 1.0625, 4.24, Math.PI);
  put(tallUnit(M), 2.3, 4.24, Math.PI);
  put(plant(M, 0.7, 'snake', 'terracotta', 5), 2.85, 4.25);

  // master bedroom
  put(rug(M, 2.4, 2.8), 8.35, 2.0, E, false);
  put(bed(M, 1.6, 2.1), 8.725, 2.0, -E);
  for (const z of [0.86, 3.14]) {
    put(nightstand(M), 9.62, z, -E);
    put(tableLamp(M, lights), 9.62, z, 0, false, 0.54);
  }
  put(wardrobe(M, 2.4, M.oakWood), 8.2, 3.84, Math.PI);
  put(armchair(M), 6.75, 0.85, 0.8);
  put(sideTable(M), 6.4, 1.65, 0);
  put(art(M, 1.0, 0.7, 0), 6.06, 1.6, E, false, 1.5);

  // bedroom 2
  put(rug(M, 2.0, 2.2), 8.4, 6.5, 0, false);
  put(bed(M, 1.4, 2.0), 8.4, 6.775, Math.PI);
  for (const x of [7.3, 9.5]) {
    put(nightstand(M, M.walnut), x, 7.62, Math.PI);
    put(tableLamp(M, lights), x, 7.62, 0, false, 0.54);
  }
  put(desk(M, lights, 1.4), 8.9, 4.56, 0);
  put(diningChair(M), 8.9, 5.0, Math.PI);
  put(wardrobe(M, 2.2, M.whiteMatte), 6.36, 5.5, E);
  put(art(M, 0.9, 0.6, 1), 8.9, 4.26, 0, false, 1.6);
  put(plant(M, 0.9, 'bush', 'terracotta', 7), 7.1, 4.6);

  // bathroom
  put(bathtub(M), 0.985, 7.49, Math.PI);
  put(toilet(M), 0.135, 6.3, E);
  put(vanity(M, 1.2), 1.2, 4.67, 0);
  put(shower(M), 2.0, 7.41, 0);
  put(towelLadder(M), 2.45, 4.67, 0, false);
  put(box(0.8, 0.012, 0.5, M.towel, 0, 0.006, 0, { r: 0.004 }), 1.0, 6.9, 0, false);

  // entrance hall
  put(wardrobe(M, 2.0, M.oakWood), 5.64, 5.75, -E);
  put(consoleCabinet(M, 1.1), 3.23, 7.0, E);
  put(roundMirror(M, 0.42), 3.06, 7.0, E, false, 1.55);
  put(box(1.0, 0.012, 0.6, M.chairFabric, 0, 0.006, 0, { r: 0.004 }), 4.52, 7.4, 0, false);
  put(art(M, 0.6, 0.8, 1), 4.3, 4.66, 0, false, 1.5);

  // balcony: frameless glass balustrade
  const rail = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0), horiz = z0 === z1;
    const g = new THREE.Group();
    g.add(box(len, 1.0, 0.014, M.glass, 0, 0.55, 0, { cast: false }));
    g.add(box(len, 0.05, 0.05, M.steel, 0, 1.06, 0, { r: 0.01 }));
    g.add(box(len, 0.06, 0.06, M.frame, 0, 0.03, 0));
    put(g, (x0 + x1) / 2, (z0 + z1) / 2, horiz ? 0 : E);
  };
  rail(1.0, -1.6, 5.0, -1.6);
  rail(1.0, -1.6, 1.0, 0);
  rail(5.0, -1.6, 5.0, 0);
  put(bistroSet(M), 3.8, -0.85, 0);
  put(plant(M, 0.8, 'bush', 'terracotta', 11), 1.35, -1.25);
  put(plant(M, 0.9, 'snake', 'white', 13), 4.6, -1.25);

  return { root, lights, solids };
}
