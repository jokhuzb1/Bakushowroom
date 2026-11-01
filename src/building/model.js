// Generates the 16-floor building from the extracted plan data (public/data/building.json):
// per-floor slabs, walls, openings and balconies, plus a classical stone facade modelled on the renders.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { piecesAround, projectUV } from '../geo.js';
import { levels, ROOF_Z, sheetIndexFor, unitsForFloor } from './units.js';

export const CX = 17.5, CY = 9.1; // plan point that becomes the world origin
const X = (x) => x - CX;
const Z = (y) => y - CY;

// Collects geometry per material and merges it into one mesh per material.
class Batch {
  constructor() { this.parts = new Map(); }
  push(mat, geo) {
    if (!this.parts.has(mat)) this.parts.set(mat, []);
    projectUV(geo, mat.map?.userData.world ?? 1.5);
    this.parts.get(mat).push(geo);
  }
  // axis-aligned box from world min/max corners
  box(mat, x0, y0, z0, x1, y1, z1) {
    if (x1 - x0 < 1e-4 || y1 - y0 < 1e-4 || z1 - z0 < 1e-4) return;
    const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    this.push(mat, g);
  }
  geo(mat, geo, matrix) {
    geo.applyMatrix4(matrix);
    this.push(mat, geo);
  }
  build(target, { cast = true, receive = true } = {}) {
    for (const [mat, list] of this.parts) {
      const merged = mergeGeometries(list, false);
      list.forEach((g) => g.dispose());
      const m = new THREE.Mesh(merged, mat);
      m.castShadow = cast && !mat.transparent;
      m.receiveShadow = receive;
      target.add(m);
    }
    this.parts.clear();
    return target;
  }
}

// A facade side: plan line + outward direction. u runs along the side, d is the offset outward from the wall face.
function sideFrame(side, f) {
  const [x0, y0, x1, y1] = f;
  if (side === 'north') return { a: x0, b: x1, box: (B, m, u0, u1, h0, h1, d0, d1) => B.box(m, X(u0), h0, Z(y0 - d1), X(u1), h1, Z(y0 - d0)) };
  if (side === 'south') return { a: x0, b: x1, box: (B, m, u0, u1, h0, h1, d0, d1) => B.box(m, X(u0), h0, Z(y1 + d0), X(u1), h1, Z(y1 + d1)) };
  if (side === 'west') return { a: y0, b: y1, box: (B, m, u0, u1, h0, h1, d0, d1) => B.box(m, X(x0 - d1), h0, Z(u0), X(x0 - d0), h1, Z(u1)) };
  return { a: y0, b: y1, box: (B, m, u0, u1, h0, h1, d0, d1) => B.box(m, X(x1 + d0), h0, Z(u0), X(x1 + d1), h1, Z(u1)) };
}

const baluster = (() => {
  const pts = [[0, 0], [0.05, 0], [0.05, 0.06], [0.03, 0.1], [0.055, 0.32], [0.03, 0.52], [0.04, 0.58], [0.05, 0.62], [0, 0.62]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  return new THREE.LatheGeometry(pts, 6); // 6 sides is indistinguishable at facade distance
})();

function balustrade(B, M, frame, u0, u1, h0, d, height = 1.0) {
  // plinth, balusters, handrail along u at outward offset d
  frame.box(B, M.stone, u0, u1, h0, h0 + 0.14, d - 0.12, d + 0.12);
  frame.box(B, M.stone, u0, u1, h0 + height - 0.1, h0 + height, d - 0.13, d + 0.13);
  const n = Math.max(2, Math.floor((u1 - u0) / 0.16));
  const s = (height - 0.24) / 0.62;
  for (let i = 0; i < n; i++) {
    const u = u0 + ((i + 0.5) / n) * (u1 - u0);
    const g = baluster.clone();
    const m = new THREE.Matrix4().makeScale(1, s, 1);
    frame.place(m, u, h0 + 0.14, d);
    B.geo(M.stoneLight, g, m);
  }
}

function ironRailing(B, M, frame, u0, u1, h0, d, height = 1.0) {
  frame.box(B, M.iron, u0, u1, h0 + height - 0.04, h0 + height, d - 0.025, d + 0.025);
  frame.box(B, M.iron, u0, u1, h0 + 0.08, h0 + 0.11, d - 0.015, d + 0.015);
  frame.box(B, M.iron, u0, u1, h0 + height - 0.26, h0 + height - 0.23, d - 0.015, d + 0.015);
  const n = Math.max(2, Math.floor((u1 - u0) / 0.11));
  for (let i = 0; i <= n; i++) {
    const u = u0 + (i / n) * (u1 - u0);
    frame.box(B, M.iron, u - 0.008, u + 0.008, h0 + 0.08, h0 + height, d - 0.008, d + 0.008);
  }
  // scroll ornament band
  for (let i = 0; i < n; i += 3) {
    const u = u0 + ((i + 1.5) / n) * (u1 - u0);
    const ring = new THREE.TorusGeometry(0.07, 0.008, 6, 16);
    const m = new THREE.Matrix4();
    frame.place(m, u, h0 + height - 0.13, d);
    B.geo(M.iron, ring, m);
  }
}

// placement helper for oriented pieces (balusters, rings) on a side
function withPlace(frame, side, f) {
  const [x0, y0, x1, y1] = f;
  frame.place = (m, u, h, d) => {
    let px, pz, rot = 0;
    if (side === 'north') { px = X(u); pz = Z(y0 - d); rot = 0; }
    else if (side === 'south') { px = X(u); pz = Z(y1 + d); rot = 0; }
    else if (side === 'west') { px = X(x0 - d); pz = Z(u); rot = Math.PI / 2; }
    else { px = X(x1 + d); pz = Z(u); rot = Math.PI / 2; }
    const t = new THREE.Matrix4().makeTranslation(px, h, pz).multiply(new THREE.Matrix4().makeRotationY(rot));
    m.premultiply(t);
  };
  return frame;
}

function openingsOn(sheet, side, frame) {
  return sheet.openings
    .filter((o) => o.side === side)
    .map((o) => {
      const r = o.rect;
      const along = side === 'north' || side === 'south' ? [r[0], r[2]] : [r[1], r[3]];
      return { kind: o.kind, from: along[0], to: along[1] };
    })
    .filter((o) => o.from > frame.a - 0.01 && o.to < frame.b + 0.01);
}

function signTexture(text) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#1b1712';
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = '#b58e4c';
  g.lineWidth = 6;
  g.strokeRect(10, 10, c.width - 20, c.height - 20);
  g.fillStyle = '#e2bf7a';
  g.font = '600 78px Georgia, "Times New Roman", serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.letterSpacing = '10px';
  g.fillText(text, c.width / 2, c.height / 2 + 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function buildBuilding(data, M) {
  const root = new THREE.Group();
  const floors = [];
  const L = levels();
  const typical = data.sheets[sheetIndexFor(8)];
  const F = typical.facade; // [x0, y0, x1, y1] plan box of the tower's outer walls

  for (const lv of L) {
    const sheet = data.sheets[sheetIndexFor(lv.floor)];
    const g = new THREE.Group();
    g.name = `floor-${lv.floor}`;
    g.userData.floor = lv.floor;
    const B = new THREE.Group();
    const S = new Batch(); // structure
    const Fc = new Batch(); // facade
    const z0 = lv.z, h = lv.h, top = z0 + h;
    const slabT = 0.22;
    // floors 2-3 reach out over the podium (terraces); their outline starts at their own north facade
    const box = lv.floor === 2 || lv.floor === 3 ? [F[0], data.sheets[1].facade[1], F[2], F[3]] : F;

    // slab with floor finish on top
    const fp = [lv.floor === 1 ? [F[0], -4.4, F[2], F[3]] : box];
    for (const r of fp) {
      S.box(M.ceiling, X(r[0]), z0 - slabT, Z(r[1]), X(r[2]), z0 - 0.03, Z(r[3]));
      S.box(M.floor, X(r[0]), z0 - 0.03, Z(r[1]), X(r[2]), z0, Z(r[3]));
    }

    // walls and door heads
    const wallTop = top - slabT;
    for (const r of sheet.walls) {
      if ((r[2] - r[0]) * (r[3] - r[1]) < 0.004) continue;
      if (lv.floor === 1 && r[1] < F[1] - 0.3) continue; // podium columns are modelled on the facade
      if (r[1] > F[3] + 0.3 || r[3] < box[1] - 0.3) continue; // dimension-line artwork outside the outline
      if (r[1] < box[1] - 0.05) {
        // the part in front of the stepped-back facade is a terrace divider: a low stone wall
        const yb = Math.min(r[3], box[1]);
        S.box(M.stone, X(r[0]), z0, Z(r[1]), X(r[2]), z0 + 1.1, Z(yb));
        if (r[3] <= box[1]) continue;
        S.box(M.wall, X(r[0]), z0, Z(box[1]), X(r[2]), wallTop, Z(r[3]));
        continue;
      }
      S.box(M.wall, X(r[0]), z0, Z(r[1]), X(r[2]), wallTop, Z(r[3]));
    }
    for (const o of sheet.openings) {
      if (o.kind !== 'door') continue;
      const r = o.rect;
      S.box(M.wall, X(r[0]), z0 + 2.15, Z(r[1]), X(r[2]), wallTop, Z(r[3]));
    }

    // facade skins with openings on the four sides
    const sides = lv.floor === 1 ? ['south', 'west', 'east'] : ['north', 'south', 'west', 'east'];
    const band = lv.floor <= 5 ? 0 : lv.floor <= 10 ? 1 : 2;
    const bandTop = lv.floor === 5 || lv.floor === 10 || lv.floor === 16;
    const bandBottom = lv.floor === 2 || lv.floor === 6 || lv.floor === 11;
    for (const side of sides) {
      const f = box;
      const fr = withPlace(sideFrame(side, f), side, f);
      const ops = openingsOn(sheet, side, fr).map((o) => {
        const isWin = o.kind === 'window';
        const sill = isWin ? (lv.floor === 1 ? 1.0 : 0.85) : 0.0;
        const head = Math.min(h - 0.55, lv.floor === 1 ? 3.6 : h - 0.55);
        return { ...o, sill, head };
      });
      const ext = 0.12;
      for (const p of piecesAround(fr.b + ext, h, ops.map((o) => ({ ...o })), fr.a - ext)) {
        fr.box(Fc, M.stone, p.u0, p.u1, z0 + p.y0, z0 + p.y1, -0.02, 0.1);
      }
      for (const o of ops) {
        const w = o.to - o.from, oh = o.head - o.sill, hz = z0 + o.sill;
        // glazing set back inside the wall, dark bronze frames
        fr.box(Fc, M.glass, o.from, o.to, hz, hz + oh, -0.16, -0.14);
        fr.box(Fc, M.frame, o.from, o.to, hz, hz + 0.06, -0.2, -0.1);
        fr.box(Fc, M.frame, o.from, o.to, hz + oh - 0.06, hz + oh, -0.2, -0.1);
        fr.box(Fc, M.frame, o.from, o.from + 0.06, hz, hz + oh, -0.2, -0.1);
        fr.box(Fc, M.frame, o.to - 0.06, o.to, hz, hz + oh, -0.2, -0.1);
        const panes = Math.max(1, Math.round(w / 0.75));
        for (let i = 1; i < panes; i++) {
          const u = o.from + (i / panes) * w;
          fr.box(Fc, M.frame, u - 0.03, u + 0.03, hz, hz + oh, -0.19, -0.11);
        }
        if (oh > 2.2) fr.box(Fc, M.frame, o.from, o.to, hz + oh - 0.55, hz + oh - 0.5, -0.19, -0.11);
        // stone surround: jambs + head, with a cornice cap on band-top floors
        fr.box(Fc, M.stoneLight, o.from - 0.12, o.from, hz, hz + oh + 0.12, 0.1, 0.15);
        fr.box(Fc, M.stoneLight, o.to, o.to + 0.12, hz, hz + oh + 0.12, 0.1, 0.15);
        fr.box(Fc, M.stoneLight, o.from - 0.12, o.to + 0.12, hz + oh, hz + oh + 0.14, 0.1, 0.16);
        if (bandTop && lv.floor > 1) {
          fr.box(Fc, M.stoneLight, o.from - 0.22, o.to + 0.22, hz + oh + 0.14, hz + oh + 0.24, 0.1, 0.3);
          if (w <= 1.7) {
            // arched fanlight above the window: dark half-disc with a stone archivolt
            const r = w / 2;
            const disc = new THREE.CircleGeometry(r - 0.06, 24, 0, Math.PI);
            const ring = new THREE.TorusGeometry(r, 0.06, 6, 24, Math.PI);
            const m1 = new THREE.Matrix4(), m2 = new THREE.Matrix4();
            fr.place(m1, (o.from + o.to) / 2, hz + oh + 0.25, 0.155);
            fr.place(m2, (o.from + o.to) / 2, hz + oh + 0.25, 0.14);
            if (side === 'north' || side === 'west') { m1.multiply(new THREE.Matrix4().makeRotationY(Math.PI)); }
            Fc.geo(M.glass, disc, m1);
            Fc.geo(M.stoneLight, ring, m2);
          }
        }
        if (o.kind === 'window' && lv.floor > 1) fr.box(Fc, M.stoneLight, o.from - 0.15, o.to + 0.15, hz - 0.08, hz, 0.0, 0.2);
      }

      // pilasters on the wider piers of the long facades (floors above the podium)
      if (lv.floor > 1 && (side === 'north' || side === 'south')) {
        const sorted = [...ops].sort((a, b) => a.from - b.from);
        let cur = fr.a;
        const piers = [];
        for (const o of sorted) { if (o.from - cur > 0.7) piers.push([cur, o.from]); cur = o.to; }
        if (fr.b - cur > 0.7) piers.push([cur, fr.b]);
        for (const [a, b] of piers) {
          const c = (a + b) / 2, pw = Math.min(0.56, (b - a) - 0.3);
          fr.box(Fc, M.stoneLight, c - pw / 2, c + pw / 2, z0, top, 0.1, 0.24);
          if (bandBottom) fr.box(Fc, M.stoneLight, c - pw / 2 - 0.07, c + pw / 2 + 0.07, z0, z0 + 0.35, 0.1, 0.3);
          if (bandTop) {
            fr.box(Fc, M.stoneLight, c - pw / 2 - 0.08, c + pw / 2 + 0.08, top - 0.62, top - 0.42, 0.1, 0.32);
            fr.box(Fc, M.stoneLight, c - pw / 2 - 0.04, c + pw / 2 + 0.04, top - 0.42, top - 0.35, 0.1, 0.28);
          }
        }
      }
      // band cornice
      if (bandTop && lv.floor < 16) {
        fr.box(Fc, M.stoneLight, fr.a - 0.45, fr.b + 0.45, top - 0.35, top - 0.15, 0.1, 0.42);
        fr.box(Fc, M.stoneLight, fr.a - 0.5, fr.b + 0.5, top - 0.15, top, 0.1, 0.5);
      }
    }

    // balconies
    for (const r of sheet.balconies) {
      const north = r[3] < F[1] + 0.05 + (lv.floor <= 3 ? 0 : 0);
      if (lv.floor <= 3 && north) continue;
      const side = north ? 'north' : 'south';
      const f = F;
      const fr = withPlace(sideFrame(side, f), side, f);
      const depth = north ? f[1] - r[1] : r[3] - f[3];
      const [u0, u1] = [r[0], r[2]];
      const deep = depth > 0.45;
      const d = Math.max(0.3, depth + 0.1);
      fr.box(Fc, M.stone, u0, u1, z0 - 0.12, z0 + 0.06, 0.05, d + 0.08);
      fr.box(Fc, M.stoneLight, u0 - 0.05, u1 + 0.05, z0 - 0.22, z0 - 0.12, 0.05, d + 0.12);
      if (deep) {
        balustrade(Fc, M, fr, u0, u1, z0 + 0.06, d - 0.04);
        // returns back to the wall
        for (const u of [u0 + 0.06, u1 - 0.06]) {
          for (let dd = 0.25; dd < d - 0.1; dd += 0.16) {
            const m = new THREE.Matrix4().makeScale(1, (1.0 - 0.24) / 0.62, 1);
            fr.place(m, u, z0 + 0.2, dd);
            Fc.geo(M.stoneLight, baluster.clone(), m);
          }
          fr.box(Fc, M.stone, u - 0.07, u + 0.07, z0 + 0.96, z0 + 1.06, 0.1, d);
        }
      } else {
        ironRailing(Fc, M, fr, u0 + 0.04, u1 - 0.04, z0 + 0.06, d - 0.02);
      }
    }

    S.build(B);
    Fc.build(B);
    g.add(B);

    // invisible hit volume for hovering / picking the floor from outside
    const hb = lv.floor === 1 ? fp[0] : box;
    const hit = new THREE.Mesh(new THREE.BoxGeometry(hb[2] - hb[0] + 0.9, h - 0.04, hb[3] - hb[1] + 0.9), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.set(X((hb[0] + hb[2]) / 2), z0 + h / 2, Z((hb[1] + hb[3]) / 2));
    hit.userData.floor = lv.floor;
    g.add(hit);

    // walk colliders (world XZ boxes)
    const colliders = sheet.walls.map((r) => ({ x0: X(r[0]), x1: X(r[2]), z0: Z(r[1]), z1: Z(r[3]) }));
    for (const r of sheet.balconies) colliders.push({ x0: X(r[0]) - 0.1, x1: X(r[2]) + 0.1, z0: Z(r[1]) - 0.15, z1: Z(r[1]) - 0.05 }, { x0: X(r[0]) - 0.1, x1: X(r[2]) + 0.1, z0: Z(r[3]) + 0.05, z1: Z(r[3]) + 0.15 });

    root.add(g);
    floors.push({ ...lv, group: g, hit, sheet, colliders, box, units: unitsForFloor(lv.floor, sheet) });
  }

  root.add(buildPodium(data, M, F));
  const roof = buildRoof(M, F);
  root.add(roof);
  return { root, floors, roof, F };
}

// Floor 1 street front: colonnade, shop glazing, signage and the podium roof (terraces of floor 2).
function buildPodium(data, M, F) {
  const g = new THREE.Group();
  g.name = 'podium';
  g.userData.floor = 1;
  const B = new Batch();
  const h = 4.74, yK = -4.4;
  const colsX = [0, 3.2, 6.2, 9.4, 12.4, 15.2, 19.4, 22.6, 25.6, 28.8, 31.8, 35.0];
  // shop glazing set back behind the columns, warm interiors behind
  B.box(M.shopGlass, X(0.1), 0.3, Z(yK + 0.35), X(34.9), 3.85, Z(yK + 0.4));
  B.box(M.shopInterior, X(0.1), 0.0, Z(yK + 1.6), X(34.9), 3.85, Z(yK + 1.65));
  for (let x = 0.1; x <= 34.95; x += 1.55) B.box(M.frame, X(x - 0.03), 0.3, Z(yK + 0.3), X(x + 0.03), 3.85, Z(yK + 0.42));
  B.box(M.frame, X(0.1), 3.0, Z(yK + 0.3), X(34.9), 3.06, Z(yK + 0.42));
  // sign band and plinth
  B.box(M.stone, X(-0.1), 3.85, Z(yK + 0.1), X(35.1), h, Z(yK + 0.5));
  B.box(M.stoneDark, X(-0.1), 0.0, Z(yK + 0.1), X(35.1), 0.3, Z(yK + 0.5));
  // side returns of the podium
  for (const x of [-0.1, 35.1]) B.box(M.stone, X(x - 0.15), 0, Z(yK + 0.1), X(x + 0.15), h, Z(F[1]));
  // columns with bases and capitals
  for (const x of colsX) {
    const cyl = new THREE.CylinderGeometry(0.26, 0.29, 3.55, 24);
    B.geo(M.stoneLight, cyl, new THREE.Matrix4().makeTranslation(X(x), 0.42 + 1.775, Z(yK)));
    B.box(M.stoneLight, X(x - 0.38), 0.0, Z(yK - 0.38), X(x + 0.38), 0.42, Z(yK + 0.38));
    B.box(M.stoneLight, X(x - 0.4), 3.97, Z(yK - 0.4), X(x + 0.4), 4.12, Z(yK + 0.4));
    const cap = new THREE.CylinderGeometry(0.38, 0.27, 0.22, 24);
    B.geo(M.stoneLight, cap, new THREE.Matrix4().makeTranslation(X(x), 3.86, Z(yK)));
  }
  // entablature + cornice over the colonnade
  B.box(M.stoneLight, X(-0.5), 4.12, Z(yK - 0.45), X(35.5), 4.5, Z(yK + 0.5));
  B.box(M.stoneLight, X(-0.7), 4.5, Z(yK - 0.7), X(35.7), 4.74, Z(yK + 0.5));
  // podium roof: terraces in red-brown tiles + balustrade at the edge
  B.box(M.terrace, X(0), 4.5, Z(yK + 0.3), X(35), 4.76, Z(F[1]));
  const fr = withPlace(sideFrame('north', [0, yK, 35, 0]), 'north', [0, yK, 35, 0]);
  balustrade(B, M, fr, -0.6, 35.6, 4.74, 0.55, 0.95);
  B.build(g);
  // the two "BAKU CITY" signs over the entrances
  const tex = signTexture('BAKU CITY');
  for (const x of [8.0, 27.0]) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 0.58), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4, metalness: 0.2, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.35 }));
    s.position.set(X(x), 4.3, Z(yK - 0.46));
    s.rotation.y = Math.PI;
    g.add(s);
  }
  return g;
}

// Gold "BAKU CITY" letters standing on the roof parapet, centred on both long facades and lit so the
// name reads from the street by day and at dusk.
function crownSign(F, z) {
  const c = document.createElement('canvas');
  c.width = 2048; c.height = 288;
  const g = c.getContext('2d');
  g.font = '700 220px Georgia, "Times New Roman", serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.letterSpacing = '28px';
  const grad = g.createLinearGradient(0, 30, 0, 260);
  grad.addColorStop(0, '#fff1c4');
  grad.addColorStop(0.45, '#e4b15a');
  grad.addColorStop(1, '#a8742c');
  g.lineWidth = 10;
  g.strokeStyle = 'rgba(70, 45, 15, 0.85)';
  g.strokeText('BAKU CITY', c.width / 2, c.height / 2 + 8);
  g.fillStyle = grad;
  g.fillText('BAKU CITY', c.width / 2, c.height / 2 + 8);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.25, metalness: 0.5, roughness: 0.35, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.9 });
  const frame = new THREE.MeshStandardMaterial({ color: 0x241c16, metalness: 0.55, roughness: 0.45 });
  const trim = new THREE.MeshStandardMaterial({ color: 0xb58e4c, metalness: 0.9, roughness: 0.3 });
  const out = new THREE.Group();
  out.name = 'crown-sign';
  // dark bronze signboard with a gold edge on the parapet; letters float just in front of it
  const w = 19, h = w * (c.height / c.width), bw = w + 1.2, bh = h + 0.7, cx = X((F[0] + F[2]) / 2), y0 = z + 1.1;
  for (const [y, s] of [[F[1] - 0.45, -1], [F[3] + 0.45, 1]]) {
    const board = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.22), frame);
    board.position.set(cx, y0 + bh / 2, Z(y));
    const edge = new THREE.Mesh(new THREE.BoxGeometry(bw + 0.24, bh + 0.24, 0.16), trim);
    edge.position.set(cx, y0 + bh / 2, Z(y) - s * 0.06);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    sign.position.set(cx, y0 + bh / 2, Z(y) + s * 0.12);
    sign.rotation.y = s > 0 ? 0 : Math.PI;
    out.add(edge, board, sign);
  }
  return out;
}

function buildRoof(M, F) {
  const g = new THREE.Group();
  g.name = 'roof';
  const B = new Batch();
  const z = ROOF_Z;
  B.box(M.roof, X(F[0]), z - 0.22, Z(F[1]), X(F[2]), z + 0.12, Z(F[3]));
  for (const side of ['north', 'south', 'west', 'east']) {
    const fr = withPlace(sideFrame(side, F), side, F);
    // crown cornice and parapet
    fr.box(B, M.stoneLight, fr.a - 0.6, fr.b + 0.6, z - 0.75, z - 0.45, 0.1, 0.45);
    fr.box(B, M.stoneLight, fr.a - 0.75, fr.b + 0.75, z - 0.45, z - 0.1, 0.1, 0.7);
    fr.box(B, M.stone, fr.a - 0.1, fr.b + 0.1, z - 0.1, z + 1.0, -0.15, 0.25);
    fr.box(B, M.stoneLight, fr.a - 0.2, fr.b + 0.2, z + 1.0, z + 1.12, -0.2, 0.32);
    fr.box(B, M.terrace, fr.a - 0.2, fr.b + 0.2, z + 1.12, z + 1.16, -0.2, 0.32);
    if (side === 'north' || side === 'south') {
      // two crests over the projecting bays, as in the render
      for (const c of [7.8, 27.2]) {
        fr.box(B, M.stone, c - 2.6, c + 2.6, z + 1.0, z + 2.2, -0.1, 0.35);
        fr.box(B, M.stoneLight, c - 2.75, c + 2.75, z + 2.2, z + 2.4, -0.15, 0.45);
        const disc = new THREE.CylinderGeometry(0.62, 0.62, 0.16, 32);
        const m = new THREE.Matrix4();
        fr.place(m, c, z + 1.6, 0.4);
        m.multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
        B.geo(M.stoneLight, disc, m);
        for (const s of [-1, 1]) {
          const scroll = new THREE.TorusGeometry(0.35, 0.09, 8, 20, Math.PI * 1.3);
          const m2 = new THREE.Matrix4();
          fr.place(m2, c + s * 1.4, z + 1.6, 0.38);
          B.geo(M.stoneLight, scroll, m2);
        }
      }
    }
  }
  // stair / lift head house and solar arrays
  B.box(M.stone, X(12.4), z, Z(8.0), X(19.4), z + 3.9, Z(17.6));
  B.box(M.stoneLight, X(12.2), z + 3.9, Z(7.8), X(19.6), z + 4.1, Z(17.8));
  for (const [xa, xb] of [[1.2, 11.2], [20.6, 33.8]]) {
    for (let y = 1.6; y < 16.5; y += 2.6) {
      const panel = new THREE.BoxGeometry(xb - xa, 0.05, 1.7);
      const m = new THREE.Matrix4().makeTranslation(X((xa + xb) / 2), z + 0.75, Z(y + 0.85)).multiply(new THREE.Matrix4().makeRotationX(-0.42));
      B.geo(M.solar, panel, m);
      B.box(M.iron, X(xa), z + 0.12, Z(y + 0.2), X(xb), z + 0.18, Z(y + 1.5));
    }
  }
  B.build(g);
  g.add(crownSign(F, z));
  return g;
}
