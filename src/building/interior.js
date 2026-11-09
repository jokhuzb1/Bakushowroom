// Furnishes apartments from the extracted room data: classifies rooms, lays finishes and places
// furniture with simple rules (against walls, clear of door swings and of each other).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as Fn from '../furniture.js';
import { model } from './models.js';
import * as ST from '../styles/warmMinimal.js';
import { box as gbox, cyl, mesh, curtainGeo } from '../geo.js';
import { CX, CY } from './model.js';

const X = (x) => x - CX, Z = (y) => y - CY;
const inside = (r, x, y) => x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3];
const overlap = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];

// ---------- room classification ----------
// the wall of a room its windows are in, from the plan's openings (null: none near it). The margin is wide:
// the rectangles of a room can stop well short of its facade.
function windowSide(room, openings) {
  const [x0, y0, x1, y1] = room.bbox, m = 2;
  const win = openings.filter((o) => o.kind !== 'door' && overlap(o.rect, [x0 - m, y0 - m, x1 + m, y1 + m]));
  if (!win.length) return null;
  const [a, b, c, d] = win.sort((p, q) => (q.rect[2] - q.rect[0]) * (q.rect[3] - q.rect[1]) - (p.rect[2] - p.rect[0]) * (p.rect[3] - p.rect[1]))[0].rect;
  if (c - a >= d - b) return (b + d) / 2 < (y0 + y1) / 2 ? 'north' : 'south';
  return (a + c) / 2 < (x0 + x1) / 2 ? 'west' : 'east';
}
export function classifyRooms(floor) {
  const { sheet, units, box } = floor;
  const rooms = [];
  for (const r of sheet.rooms ?? []) {
    const [lx, ly] = r.label;
    if (ly < box[1] + 0.05 || ly > box[3] - 0.05) continue; // balconies come from the slab outlines below
    let type = null;
    const unit = units.find((u) => u.kind === 'apartment' && u.rects.some((q) => inside(q, lx, ly)));
    if (!unit) continue;
    // layout rectangle: the largest rectangle that fits inside the room
    const big = r.inner ?? [...r.rects].sort((a, b) => (b[2] - b[0]) * (b[3] - b[1]) - (a[2] - a[0]) * (a[3] - a[1]))[0];
    if (!big) continue;
    let side = null;
    if (r.bbox[1] < box[1] + 0.6) side = 'north';
    else if (r.bbox[3] > box[3] - 0.6) side = 'south';
    if (!type) type = r.fixtures > 0.04 ? 'bath' : side ? 'facade' : 'hall';
    rooms.push({ ...r, unit, type, side, rect: big });
  }
  // balconies: the slab outlines drawn outside the facade, given to the flat behind them (on floor 1
  // floor, under the street, those outlines are the entrance steps)
  for (const b of floor.floor === 1 ? [] : sheet.balconies ?? []) {
    const north = b[3] <= box[1] + 0.15, south = b[1] >= box[3] - 0.15;
    if (!north && !south) continue;
    const cx = (b[0] + b[2]) / 2, cy = north ? box[1] + 0.4 : box[3] - 0.4;
    const unit = units.find((u) => u.kind === 'apartment' && u.rects.some((q) => inside(q, cx, cy)));
    if (!unit || (b[2] - b[0]) < 0.8 || (b[3] - b[1]) < 0.4) continue; // French balconies are just railings
    const r = [b[0], b[1], b[2], b[3]];
    rooms.push({ area: +((b[2] - b[0]) * (b[3] - b[1])).toFixed(2), label: [cx, (b[1] + b[3]) / 2], bbox: r, inner: r, rects: [r], fixtures: 0, unit, type: 'balcony', side: north ? 'north' : 'south', rect: r });
  }
  // A room whose plan label sits in a facade sliver reads as two: the sliver and a big "hall" behind it with no
  // wall between them. They are one room, and a big enough hall with a window of its own is a room too.
  for (const h of rooms.filter((r) => r.type === 'hall' && r.area >= 10)) {
    const near = (a, b) => a[0] < b[2] + 0.3 && a[2] > b[0] - 0.3 && a[1] < b[3] + 0.3 && a[3] > b[1] - 0.3;
    const i = rooms.findIndex((r) => r.unit === h.unit && r.type === 'facade' && r.area < 6 && near(r.rect, h.rect));
    if (i >= 0) {
      const [sliver] = rooms.splice(i, 1);
      Object.assign(h, {
        type: 'facade', side: sliver.side, area: +(h.area + sliver.area).toFixed(2), rects: [...h.rects, ...sliver.rects],
        bbox: [Math.min(h.bbox[0], sliver.bbox[0]), Math.min(h.bbox[1], sliver.bbox[1]), Math.max(h.bbox[2], sliver.bbox[2]), Math.max(h.bbox[3], sliver.bbox[3])],
        rect: [Math.max(h.rect[0], sliver.rect[0]), Math.min(h.rect[1], sliver.rect[1]), Math.min(h.rect[2], sliver.rect[2]), Math.max(h.rect[3], sliver.rect[3])],
      });
      h.inner = h.rect;
    } else if (h.area >= 12) {
      const side = windowSide(h, sheet.openings);
      if (side) Object.assign(h, { type: 'facade', side });
    }
  }
  for (const u of units) {
    const fac = rooms.filter((r) => r.unit === u && r.type === 'facade').sort((a, b) => b.area - a.area);
    fac.forEach((r, i) => {
      r.type = i === 0 ? 'living' : 'bedroom';
      if (i === 2 || (i > 0 && r.area < 13 && fac.length > 2)) r.kids = true;
    });
    u.rooms = u.rooms ?? (fac.length > 0 ? fac.length - 1 || 1 : null);
  }
  return rooms;
}

// ---------- local room frame ----------
// Window wall at d = 0, depth d into the room, u across it. Object fronts face local +z.
function frame(rect, side, swings, z, walls = [], roomRects = null, clears = []) {
  const [x0, y0, x1, y1] = rect;
  const s = side ?? ((x1 - x0) > (y1 - y0) ? 'west' : 'north');
  const f = {
    north: { O: [x0, y0], U: [1, 0], D: [0, 1], W: x1 - x0, L: y1 - y0 },
    south: { O: [x1, y1], U: [-1, 0], D: [0, -1], W: x1 - x0, L: y1 - y0 },
    west: { O: [x0, y1], U: [0, -1], D: [1, 0], W: y1 - y0, L: x1 - x0 },
    east: { O: [x1, y0], U: [0, 1], D: [-1, 0], W: y1 - y0, L: x1 - x0 },
  }[s];
  const toPlan = (u, d) => [f.O[0] + u * f.U[0] + d * f.D[0], f.O[1] + u * f.U[1] + d * f.D[1]];
  const toFrame = (x, y) => {
    const dx = x - f.O[0], dy = y - f.O[1];
    return [dx * f.U[0] + dy * f.U[1], dx * f.D[0] + dy * f.D[1]];
  };
  // door swings in frame coordinates (keep clear, with a margin)
  const blocked = [];
  for (const sw of [...swings, ...clears]) {
    if (!overlap(sw, [x0 - 0.3, y0 - 0.3, x1 + 0.3, y1 + 0.3])) continue;
    const a = toFrame(sw[0], sw[1]), b = toFrame(sw[2], sw[3]);
    blocked.push([Math.min(a[0], b[0]) - 0.1, Math.min(a[1], b[1]) - 0.1, Math.max(a[0], b[0]) + 0.1, Math.max(a[1], b[1]) + 0.1]);
  }
  const g = new THREE.Group();
  const colliders = [];
  // face: 'in' (towards back, +d), 'out' (towards window, -d), 'right' (+u), 'left' (-u)
  const dirs = { in: [0, 1], out: [0, -1], right: [1, 0], left: [-1, 0] };
  const fits = (box, pad = 0.02) => box[0] >= -pad && box[1] >= -pad && box[2] <= f.W + pad && box[3] <= f.L + pad && !blocked.some((b) => overlap(b, box));
  // The layout rectangle is the largest one inside the room, so it can sit a little in front of the real
  // wall. Pieces placed near an edge are pushed back by the measured gap so they stand flush.
  const hitsWall = (x, y) => walls.some((q) => x >= q[0] - 0.005 && x <= q[2] + 0.005 && y >= q[1] - 0.005 && y <= q[3] + 0.005);
  function gapBehind(u, d, bu, bd) {
    const eu = bu < 0 ? 0 : bu > 0 ? f.W : u, ed = bd < 0 ? 0 : bd > 0 ? f.L : d;
    // search up to 3 m (rooms with a nook), but only while still inside the room (never slide into a doorway)
    const inRoom = (x, y) => !roomRects || roomRects.some((q) => x > q[0] - 0.12 && x < q[2] + 0.12 && y > q[1] - 0.12 && y < q[3] + 0.12);
    for (let t = 0; t <= 3.0; t += 0.01) {
      const [x, y] = toPlan(eu + bu * t, ed + bd * t);
      if (hitsWall(x, y)) return t;
      if (!inRoom(x, y)) return null;
    }
    return null;
  }
  const accents = [];
  function put(obj, u, d, face, w, dep, { solid = true, check = true, y = 0, reserve = true, snap = true, accent = false } = {}) {
    const across = face === 'in' || face === 'out';
    const hw = (across ? w : dep) / 2, hd = (across ? dep : w) / 2;
    let fb = [u - hw, d - hd, u + hw, d + hd];
    if (check && !fits(fb)) return false;
    if (snap && walls.length) {
      const [bu, bd] = dirs[face].map((v) => -v); // the piece's back points away from its front
      const backDist = bu < 0 ? fb[0] : bu > 0 ? f.W - fb[2] : bd < 0 ? fb[1] : f.L - fb[3];
      if (backDist < 0.25) {
        const gap = gapBehind(u, d, bu, bd) ?? 0;
        u += bu * gap; d += bd * gap;
        fb = [u - hw, d - hd, u + hw, d + hd];
      }
    }
    if (reserve) blocked.push(fb);
    const [px, py] = toPlan(u, d);
    const [fu, fd] = dirs[face];
    const wx = fu * f.U[0] + fd * f.D[0], wy = fu * f.U[1] + fd * f.D[1];
    const holder = new THREE.Group();
    holder.position.set(X(px), z + y, Z(py));
    holder.rotation.y = Math.atan2(wx, wy);
    if (accent) accents.push({ x: X(px), z: Z(py), y: z + y, nx: wx, nz: wy });
    holder.add(obj);
    g.add(holder);
    if (solid) {
      const a = toPlan(fb[0], fb[1]), b = toPlan(fb[2], fb[3]);
      colliders.push({ x0: X(Math.min(a[0], b[0])), x1: X(Math.max(a[0], b[0])), z0: Z(Math.min(a[1], b[1])), z1: Z(Math.max(a[1], b[1])) });
    }
    return true;
  }
  // is there a solid wall behind a piece standing at (u, d) facing ?
  const backed = (u, d, face) => { const [fu, fd] = dirs[face]; return gapBehind(u, d, -fu, -fd) !== null; };
  return { ...f, side: s, put, fits, blocked, group: g, colliders, toPlan, accents, backed };
}

// ---------- room layouts ----------
// a real model from the library when available, else the procedural piece
const real = (M, id, fit, fallback) => model(M.lib, id, fit) ?? fallback?.() ?? null;
// a design package's own version of a piece (same footprint), else the standard one
const pick = (M, key, standard) => M.swap?.[key]?.() ?? standard();
const PLANTS = ['potted_plant_01', 'potted_plant_02'];
const VASES = ['ceramic_vase_01', 'ceramic_vase_02', 'ceramic_vase_04'];

// TV wall: slatted walnut console (real model) with a wall-mounted TV and a vase
function tvWall(M, w) {
  const g = new THREE.Group();
  const cab = ST.mediaConsole(M, w);
  cab.userData.size = new THREE.Vector3(w, 0.575, 0.42);
  g.add(cab);
  // ribbed oak feature wall behind the TV (full height, a little wider than the console)
  const pw = w + 0.5, ph = 2.45;
  g.add(gbox(pw, ph, 0.018, M.walnutVeneer, 0, ph / 2, -0.215));
  const n = Math.round(pw / 0.06);
  for (let i = 0; i < n; i++) g.add(gbox(0.03, ph, 0.025, M.oakVeneer, -pw / 2 + (i + 0.5) * (pw / n), ph / 2, -0.195, { offset: [i * 0.17, 0] }));
  const ch = cab.userData.size.y;
  g.add(gbox(Math.min(1.4, w * 0.85), 0.8, 0.035, M.screen, 0, ch + 0.62, -0.17));
  g.add(gbox(Math.min(1.4, w * 0.85) + 0.012, 0.812, 0.02, M.blackMetal, 0, ch + 0.62, -0.19));
  // lit vertical lines in the panel, a line under the console (only design packages with an LED line)
  if (M.ledLine) {
    for (const s of [-1, 1]) g.add(gbox(0.012, ph, 0.006, M.ledLine, s * (pw / 2 - 0.02), ph / 2, -0.178, { cast: false }));
    g.add(gbox(w - 0.1, 0.008, 0.012, M.ledLine, 0, 0.245, 0.19, { cast: false }));
  }
  return g;
}
function curtains(M, F, h) {
  if (F.W < 1.2 || F.windowless) return;
  const ch = h - 0.08; // ceiling to floor, as in the reference
  for (const u of [0.32, F.W - 0.32]) {
    const c = mesh(curtainGeo(0.6, ch, 4.5), M.curtain);
    F.put(c, u, 0.16, 'in', 0.6, 0.1, { solid: false, check: false, reserve: false, y: 0.01 + ch / 2 });
  }
  if (M.sheer && F.W > 1.6) {
    const sh = mesh(curtainGeo(F.W - 1.1, ch, Math.round((F.W - 1.1) * 4)), M.sheer, { cast: false });
    F.put(sh, F.W / 2, 0.09, 'in', F.W - 1.1, 0.05, { solid: false, check: false, reserve: false, y: 0.01 + ch / 2 });
  }
  const rail = new THREE.Group();
  rail.add(gbox(F.W - 0.1, 0.03, 0.03, M.blackMetal, 0, 0, 0));
  F.put(rail, F.W / 2, 0.13, 'in', F.W - 0.1, 0.03, { solid: false, check: false, reserve: false, y: h - 0.05 });
}

function living(M, F, h, seed) {
  curtains(M, F, h);
  F.put(real(M, PLANTS[seed % 2], { h: 1.25 }, () => Fn.plant(M, 1.4, 'fiddle', 'white', seed)), 0.4, 0.5, 'in', 0.5, 0.5);
  // seating zone near the window: sofa on one long wall, TV on the other
  const sw = Math.min(2.2, Math.max(1.6, F.L * 0.34));
  const sd = Math.max(0.95, 0.75 + sw / 2);
  let left = true;
  if (!F.fits([0, sd - sw / 2, 0.95, sd + sw / 2])) left = false;
  const sofaU = left ? 0.48 : F.W - 0.48, tvU = left ? F.W - 0.22 : 0.22;
  F.put(Fn.rug(M, 2.0, Math.min(2.6, sw + 0.4)), F.W / 2, sd, 'in', 2.0, sw + 0.4, { solid: false, check: false, reserve: false });
  F.put(Fn.sofa(M, sw), sofaU, sd, left ? 'right' : 'left', sw, 0.95);
  F.put(Fn.art(M, Math.min(1.5, sw * 0.7), 0.85, seed % 2), left ? 0.01 : F.W - 0.01, sd, left ? 'right' : 'left', 1.5, 0.03, { solid: false, check: false, reserve: false, y: 1.62, accent: true });
  F.put(tvWall(M, Math.min(1.6, sw)), tvU, sd, left ? 'left' : 'right', Math.min(1.6, sw), 0.45, { accent: true, y: 0 });
  if (F.W >= 2.7) {
    F.put(pick(M, 'coffeeTable', () => ST.coffeeTable(M)), (sofaU + tvU) / 2 + (left ? 0.15 : -0.15), sd, left ? 'right' : 'left', 0.62, 1.0);
    F.put(ST.flowers(M, 0.3, 1), (sofaU + tvU) / 2 + (left ? 0.15 : -0.15), sd - 0.22, 'in', 0.1, 0.1, { solid: false, check: false, reserve: false, y: 0.39 });
  }
  // upholstered ottoman with a throw at the open end of the seating group
  F.put(ST.ottoman(M), (sofaU + tvU) / 2, sd + sw / 2 + 0.25, 'in', 1.1, 0.6);
  F.put(pick(M, 'floorLamp', () => Fn.floorLamp(M, [])), left ? 0.3 : F.W - 0.3, sd + sw / 2 + 0.3, 'in', 0.4, 0.4);

  // kitchen at the back: along the back wall if clear, else along a long wall
  const kLen = Math.min(2.8, F.W - 0.65);
  let kitchenFront = F.L;
  // the run needs a real wall behind it (open-plan rooms can have the hall there)
  const backRun = F.fits([0, F.L - 0.62, F.W, F.L]) && F.backed(kLen / 2 + 0.6, F.L - 0.31, 'out');
  if (backRun && F.W >= 2.2) {
    F.put(ST.kitchenRun(M, kLen, { sink: kLen * 0.22, cooktop: -kLen * 0.22 }), kLen / 2 + 0.6, F.L - 0.31, 'out', kLen, 0.62);
    F.put(ST.tallUnit(M), 0.3, F.L - 0.31, 'out', 0.6, 0.62);
    kitchenFront = F.L - 0.62;
  } else {
    const run = Math.min(2.6, F.L * 0.36);
    for (const [u, face] of [[0.31, 'right'], [F.W - 0.31, 'left']]) {
      const d = F.L - 0.15 - run / 2;
      if (F.fits([u - 0.31, d - run / 2 - 0.6, u + 0.31, d + run / 2]) && F.backed(u, d, face)) {
        F.put(ST.kitchenRun(M, run, { sink: run * 0.2, cooktop: -run * 0.25 }), u, d, face, run, 0.62);
        F.put(ST.tallUnit(M), u, d - run / 2 - 0.3, face, 0.6, 0.62);
        kitchenFront = d - run / 2 - 0.6;
        break;
      }
    }
  }
  // dining between seating and kitchen
  // search the free floor behind the seating for a 2 x 2 m spot (table + four chairs)
  let spot = null;
  const dMin = sd + sw / 2 + 0.9;
  // (the free floor nearest the middle of that stretch: a doorway can block the middle itself)
  const dMid = (dMin + kitchenFront) / 2;
  const depths = [];
  for (let dc = dMin; dc <= F.L - 1.0; dc += 0.15) depths.push(dc);
  depths.sort((a, b) => Math.abs(a - dMid) - Math.abs(b - dMid));
  for (const dc of depths) {
    if (spot) break;
    for (const uc of [F.W / 2, F.W * 0.6, F.W * 0.4, F.W * 0.7, F.W * 0.3]) if (F.fits([uc - 1.0, dc - 1.0, uc + 1.0, dc + 1.0])) { spot = [uc, dc]; break; }
  }
  if (spot) {
    const [uc, dc] = spot;
    if (F.put(pick(M, 'diningTable', () => ST.diningTable(M)), uc, dc, 'in', 0.9, 0.9, { snap: false })) {
      const lamp = pick(M, 'pendant', () => real(M, 'modern_ceiling_lamp_01', { h: 0.9 }));
      if (lamp) F.put(lamp, uc, dc, 'in', 0.1, 0.1, { solid: false, check: false, reserve: false, snap: false, y: h - 0.02 - lamp.userData.size.y });
      else F.put(Fn.pendant(M, [], h - 0.02, 0.85), uc, dc, 'in', 0.1, 0.1, { solid: false, check: false, reserve: false, snap: false });
      const chairs = [[uc, dc - 0.62, 'in'], [uc, dc + 0.62, 'out'], [uc - 0.62, dc, 'right'], [uc + 0.62, dc, 'left']];
      // the 2 x 2 m spot was checked for the whole set; chairs tuck under the table edge, so skip the overlap test
      for (const [u, d, face] of chairs) F.put(pick(M, 'diningChair', () => ST.diningChair(M)), u, d, face, 0.42, 0.42, { snap: false, check: false });
    }
  }
  // a long room gets a sideboard with a picture on the wall the middle of it would otherwise leave bare
  if (F.L > 7) {
    const dm = spot ? (spot[1] < F.L / 2 ? (spot[1] + kitchenFront) / 2 : (dMin + spot[1]) / 2) : F.L * 0.55;
    for (const [u, face] of [[F.W - 0.2, 'left'], [0.2, 'right']]) {
      if (F.put(Fn.consoleCabinet(M, 1.6), u, dm, face, 1.6, 0.35)) {
        F.put(Fn.art(M, 1.2, 0.75, seed % 2), face === 'left' ? F.W - 0.01 : 0.01, dm, face, 1.2, 0.03, { solid: false, check: false, reserve: false, y: 1.55 });
        break;
      }
    }
  }
}

function bedroom(M, F, h, seed, kids) {
  curtains(M, F, h);
  const bw = kids ? 0.95 : F.W >= 3.0 ? 1.6 : 1.4, bl = kids ? 2.0 : 2.1;
  const tries = [
    ['out', F.W / 2, F.L - bl / 2 - 0.12],
    ['out', kids ? bw / 2 + 0.05 : F.W / 2, F.L - bl / 2 - 0.12],
    ['right', bl / 2 + 0.12, F.L * 0.55],
    ['left', F.W - bl / 2 - 0.12, F.L * 0.55],
  ];
  let placed = null;
  for (const [face, u, d] of tries) {
    const across = face === 'out';
    if (F.put(Fn.bed(M, bw, bl), u, d, face, across ? bw + 0.24 : bw + 0.24, bl + 0.12)) { placed = [face, u, d]; break; }
  }
  if (placed) {
    const [face, u, d] = placed;
    F.put(Fn.rug(M, bw + 0.9, 1.7), face === 'out' ? u : u + (face === 'right' ? 0.25 : -0.25), face === 'out' ? d + 0.25 : d, face === 'out' ? 'in' : 'right', bw + 0.9, 1.7, { solid: false, check: false, reserve: false });
    const sides = face === 'out'
      ? [[u - bw / 2 - 0.36, F.L - 0.25], [u + bw / 2 + 0.36, F.L - 0.25]]
      : [[face === 'right' ? 0.25 : F.W - 0.25, d - bw / 2 - 0.36], [face === 'right' ? 0.25 : F.W - 0.25, d + bw / 2 + 0.36]];
    for (const [nu, nd] of kids ? sides.slice(1) : sides) {
      if (F.put(Fn.nightstand(M), nu, nd, face, 0.46, 0.4)) {
        F.put(Fn.tableLamp(M, []), nu, nd, face, 0.1, 0.1, { solid: false, check: false, reserve: false, y: 0.54 });
        if (nu === sides[0][0] && nd === sides[0][1]) F.put(ST.flowers(M, 0.32, 1), nu + 0.1, nd, face, 0.1, 0.1, { solid: false, check: false, reserve: false, y: 0.54 });
      }
    }
    {
      // headboard wall: fabric panels with an oak cap rail, on whichever wall the bed stands against
      const span = face === 'out' ? F.W : F.L;
      const fw = Math.min(span - 0.04, bw + 1.6), fh = 1.35, wall = new THREE.Group();
      const k = Math.max(3, Math.round(fw / 0.45));
      for (let i = 0; i < k; i++) {
        const pnl = mesh(Fn.pillowGeo(fw / k - 0.015, 0.035, fh, 0.12, 4), M.fabricWall, { offset: [i * 0.21, 0] });
        pnl.rotation.x = Math.PI / 2;
        pnl.position.set(-fw / 2 + (i + 0.5) * (fw / k), fh / 2 + 0.05, 0.02);
        wall.add(pnl);
      }
      wall.add(gbox(fw + 0.04, 0.03, 0.06, M.oakVeneer, 0, fh + 0.08, 0.03));
      if (M.ledLine) wall.add(gbox(fw, 0.008, 0.012, M.ledLine, 0, fh + 0.06, 0.066, { cast: false })); // a lit line under the rail
      const at = face === 'out' ? [u, F.L - 0.02] : face === 'right' ? [0.02, d] : [F.W - 0.02, d];
      const art = face === 'out' ? [u, F.L - 0.06] : face === 'right' ? [0.06, d] : [F.W - 0.06, d];
      F.put(wall, at[0], at[1], face, fw, 0.05, { solid: false, check: false, reserve: false });
      for (const s of [-1, 1]) {
        const sc = new THREE.Group();
        sc.add(cyl(0.05, 0.05, 0.015, M.brass, 0, 0, 0.0075, 20).rotateX(Math.PI / 2));
        sc.add(gbox(0.012, 0.012, 0.16, M.brass, 0, 0, 0.09));
        sc.add(mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.14, 24, 1, true), M.lampShade, { uv: false }).translateZ(0.17).translateY(0.02));
        const off = s * (bw / 2 + 0.32);
        const p = face === 'out' ? [u + off, F.L - 0.03] : face === 'right' ? [0.03, d + off] : [F.W - 0.03, d + off];
        F.put(sc, p[0], p[1], face, 0.2, 0.2, { solid: false, check: false, reserve: false, y: 1.3 });
      }
      F.put(Fn.art(M, Math.min(1.1, bw), 0.6, seed % 2), art[0], art[1], face, 1, 0.03, { solid: false, check: false, reserve: false, y: 1.75, accent: true });
    }
  }
  // built-in wardrobe as long as a side wall allows (floor to just under the ceiling cove)
  let wardWall = null;
  const wh = h - 0.18;
  outer: for (const [u, face] of [[0.31, 'right'], [F.W - 0.31, 'left']]) {
    for (let len = Math.min(3.4, F.L - 0.9); len >= 1.2; len -= 0.2) {
      for (let d = F.L - len / 2 - 0.05; d >= len / 2 + 0.5; d -= 0.2) {
        if (F.put(ST.builtInWardrobe(M, len, wh), u, d, face, len, 0.62)) { wardWall = face; break outer; }
      }
    }
  }
  if (placed && !kids) {
    const [face, u, d] = placed;
    // TV facing the bed (on the free side wall for beds against the back wall)
    const spots = face === 'right' ? [[F.W - 0.2, 'left', d]] : face === 'left' ? [[0.2, 'right', d]]
      : [[wardWall === 'right' ? F.W - 0.2 : 0.2, wardWall === 'right' ? 'left' : 'right', Math.max(1.0, d - bl / 2 - 0.2)]];
    for (const [tu, tf, td] of spots) {
      for (const dd of [td, td + 0.4, td - 0.4, td + 0.8]) if (F.put(ST.wallTV(M, 1.2), tu, dd, tf, 1.4, 0.36, { accent: true })) break;
    }
    // upholstered bench at the foot of the bed
    const foot = face === 'out' ? [u, d - bl / 2 - 0.32, 'out'] : face === 'right' ? [u + bl / 2 + 0.32, d, 'right'] : [u - bl / 2 - 0.32, d, 'left'];
    F.put(ST.bench(M, Math.min(1.3, bw)), foot[0], foot[1], foot[2], Math.min(1.3, bw), 0.42, { snap: false });
  }
  if (kids) {
    for (const [u, face] of [[F.W - 0.31, 'left'], [0.31, 'right']]) {
      if (F.put(Fn.desk(M, [], 1.2), u, 1.1, face, 1.2, 0.6)) { F.put(Fn.diningChair(M), u + (face === 'left' ? -0.55 : 0.55), 1.1, face === 'left' ? 'right' : 'left', 0.46, 0.46); break; }
    }
  } else {
    const chair = () => ST.loungeChair(M);
    if (!F.put(chair(), F.W - 0.55, 0.8, 'left', 0.85, 0.85)) F.put(chair(), 0.55, 0.8, 'right', 0.85, 0.85);
  }
  F.put(real(M, PLANTS[(seed + 1) % 2], { h: 0.8 }, () => Fn.plant(M, 0.9, 'snake', 'terracotta', seed)), 0.32, 0.35, 'in', 0.4, 0.4);
  const basket = real(M, 'wicker_basket_02', { w: 0.35 });
  if (basket) F.put(basket, F.W - 0.3, F.L * 0.5, 'in', 0.36, 0.26);
}

// Balcony: bistro set facing the view, plants in the corners, lantern and an outdoor rug.
function balcony(M, F, seed) {
  if (F.W < 0.9 || F.L < 0.4) return; // French balconies (0.26 m) only get the railing
  const deep = F.L >= 0.5 && F.W >= 2; // the 0.56 m loggias here still take a slim bistro set
  F.put(Fn.rug(M, Math.min(1.6, F.W - 0.4), Math.min(0.9, F.L - 0.2)), F.W / 2, F.L / 2, 'in', 1.6, 0.9, { solid: false, check: false, reserve: false, snap: false });
  if (deep) { const set = Fn.bistroSet(M); set.scale.setScalar(Math.min(1, F.L / 0.6)); F.put(set, F.W / 2, F.L / 2, 'in', 1.15, 0.55, { check: false, snap: false }); }
  for (const [u, id] of [[0.3, 'potted_plant_02'], [F.W - 0.3, 'potted_plant_01']]) {
    const p = real(M, id, { h: deep ? 0.95 : 0.7 }, () => Fn.plant(M, 0.8, 'bush', 'terracotta', seed));
    F.put(p, u, F.L - 0.32, 'in', 0.5, 0.5, { check: false, snap: false });
  }
  const lantern = new THREE.Group();
  lantern.add(gbox(0.16, 0.3, 0.16, M.blackMetal, 0, 0.15, 0, { r: 0.01 }));
  lantern.add(cyl(0.045, 0.045, 0.12, M.bulb, 0, 0.14, 0, 16));
  F.put(lantern, F.W / 2 + (deep ? 0.8 : 0), F.L / 2, 'in', 0.2, 0.2, { check: false, snap: false, solid: false });
}

function pictureLedge(M, len, seed) {
  const g = new THREE.Group();
  g.add(gbox(len, 0.03, 0.09, M.oakVeneer, 0, 0, 0.045));
  g.add(gbox(len, 0.025, 0.01, M.oakVeneer, 0, 0.025, 0.088));
  let x = -len / 2 + 0.12;
  for (let i = 0; x < len / 2 - 0.25; i++) {
    const w = 0.28 + ((seed + i * 7) % 3) * 0.08, h = 0.36 + ((seed + i * 5) % 3) * 0.1;
    const fr = Fn.art(M, w, h, (seed + i) % 2);
    fr.position.set(x + w / 2, h / 2 + 0.015, 0.035);
    fr.rotation.x = -0.08;
    g.add(fr);
    x += w + 0.08;
  }
  return g;
}

function hall(M, F) {
  {
    // picture ledge on the longest free wall
    const len = Math.min(1.6, F.L - 0.8);
    if (len > 0.8) for (const [u, face] of [[F.W - 0.01, 'left'], [0.01, 'right']]) {
      if (F.put(pictureLedge(M, len, 3), u, F.L / 2, face, len, 0.1, { solid: false, y: 1.45 })) break;
    }
  }
  // runner rug down the length of the hall
  if (F.W >= 0.9) F.put(Fn.rug(M, Math.min(0.8, F.W - 0.3), Math.max(1, F.L - 0.6)), F.W / 2, F.L / 2, 'in', 0.8, F.L - 0.6, { solid: false, check: false, reserve: false, snap: false });
  for (const [u, face] of [[0.31, 'right'], [F.W - 0.31, 'left']]) {
    for (let d = F.L - 0.85; d > 0.75; d -= 0.25) {
      if (F.put(ST.builtInWardrobe(M, 1.4, 2.4), u, d, face, 1.4, 0.62)) return;
    }
  }
  for (const [u, face] of [[0.2, 'right'], [F.W - 0.2, 'left']]) {
    if (F.put(Fn.consoleCabinet(M, 1.0), u, F.L / 2, face, 1.0, 0.35)) {
      F.put(ST.flowers(M, 0.5, 0), u, F.L / 2 + 0.3, face, 0.1, 0.1, { solid: false, check: false, reserve: false, y: 0.76 });
      F.put(Fn.roundMirror(M, 0.38), u - (face === 'right' ? 0.17 : -0.17), F.L / 2, face, 0.1, 0.1, { solid: false, check: false, reserve: false, y: 1.5 });
      return;
    }
  }
}

// bathroom fixtures at the positions drawn on the plan
function bathroom(M, room, fixtures, z, h, g, colliders) {
  const r = room.rect;
  const mid = (q) => [(q[0] + q[2]) / 2, (q[1] + q[3]) / 2];
  const trays = fixtures.filter((f) => f.kind === 'shower' || f.kind === 'bath').map((f) => f.rect);
  let basins = 0;
  for (const fx of fixtures) {
    const c = mid(fx.rect);
    if (!inside([r[0] - 0.1, r[1] - 0.1, r[2] + 0.1, r[3] + 0.1], c[0], c[1])) continue;
    // a drain drawn inside a shower tray is not a basin; and one basin per bathroom
    if (fx.kind === 'basin' && (trays.some((t) => inside([t[0] - 0.02, t[1] - 0.02, t[2] + 0.02, t[3] + 0.02], c[0], c[1])) || basins++ > 0)) continue;
    // back against the nearest wall of the room
    const dist = [['west', c[0] - r[0]], ['east', r[2] - c[0]], ['north', c[1] - r[1]], ['south', r[3] - c[1]]].sort((a, b) => a[1] - b[1]);
    const wall = dist[0][0];
    const face = { west: [1, 0], east: [-1, 0], north: [0, 1], south: [0, -1] }[wall];
    const holder = new THREE.Group();
    const rot = Math.atan2(face[0], face[1]);
    if (fx.kind === 'shower') {
      const w = fx.rect[2] - fx.rect[0], d = fx.rect[3] - fx.rect[1];
      holder.add(gbox(w, 0.05, d, M.stone, 0, 0.025, 0));
      holder.position.set(X(c[0]), z, Z(c[1]));
      // glass on the sides that face into the room
      for (const [s, nx, nz] of [['west', -1, 0], ['east', 1, 0], ['north', 0, -1], ['south', 0, 1]]) {
        const edge = { west: fx.rect[0] - r[0], east: r[2] - fx.rect[2], north: fx.rect[1] - r[1], south: r[3] - fx.rect[3] }[s];
        if (edge < 0.15) continue;
        const len = nx ? d : w;
        const p = gbox(nx ? 0.012 : len, 2.0, nx ? len : 0.012, M.glass, (nx * w) / 2, 1.05, (nz * d) / 2, { cast: false });
        holder.add(p);
        holder.add(gbox(nx ? 0.02 : len, 0.02, nx ? len : 0.02, M.blackMetal, (nx * w) / 2, 2.05, (nz * d) / 2));
      }
      const head = gbox(0.22, 0.012, 0.22, M.chrome, 0, 2.1, 0, { r: 0.004 });
      holder.add(head);
      g.add(holder);
      continue;
    }
    const piece = fx.kind === 'toilet' ? Fn.toilet(M) : fx.kind === 'bath' ? Fn.bathtub(M) : Fn.vanity(M, Math.max(0.6, Math.min(0.9, Math.max(fx.rect[2] - fx.rect[0], fx.rect[3] - fx.rect[1]) + 0.15)));
    const wallPos = { west: [r[0], c[1]], east: [r[2], c[1]], north: [c[0], r[1]], south: [c[0], r[3]] }[wall];
    holder.position.set(X(wallPos[0]), z, Z(wallPos[1]));
    holder.rotation.y = rot;
    if (fx.kind === 'bath') piece.position.z = 0.38; // the tub is modelled about its centre
    holder.add(piece);
    g.add(holder);
    colliders.push({ x0: X(fx.rect[0]), x1: X(fx.rect[2]), z0: Z(fx.rect[1]), z1: Z(fx.rect[3]) });
  }
}

// ---------- finishes ----------
function floorFinish(room, mat, z, g) {
  // strips overlap a little (same height, same material) so irregular rooms get a continuous floor
  const e = 0.12;
  for (const r of room.rects) {
    const geo = new THREE.PlaneGeometry(r[2] - r[0] + e * 2, r[3] - r[1] + e * 2).rotateX(-Math.PI / 2);
    geo.translate(X((r[0] + r[2]) / 2), z + 0.006, Z((r[1] + r[3]) / 2));
    g.add(mesh(geo, mat, { cast: false }));
  }
}
function tileWalls(room, mat, z, swings, g, H) {
  // full-height tiles: modern look, and it closes off thin partitions the plan extraction can miss
  const [x0, y0, x1, y1] = room.rect;
  const t = 0.012;
  const edges = [[x0, y0, x1, y0, 0, 1], [x0, y1, x1, y1, 0, -1], [x0, y0, x0, y1, 1, 0], [x1, y0, x1, y1, -1, 0]];
  for (const [ax, ay, bx, by, nx, ny] of edges) {
    const horiz = ay === by;
    // leave the doorway open where a door swing touches this edge
    const cuts = swings.filter((s) => overlap(s, [Math.min(ax, bx) - 0.05, Math.min(ay, by) - 0.05, Math.max(ax, bx) + 0.05, Math.max(ay, by) + 0.05]))
      .map((s) => (horiz ? [s[0], s[2]] : [s[1], s[3]]));
    let segs = [[horiz ? ax : ay, horiz ? bx : by]];
    for (const [c0, c1] of cuts) segs = segs.flatMap(([a, b]) => (c1 <= a || c0 >= b ? [[a, b]] : [[a, c0], [c1, b]]).filter(([p, q]) => q - p > 0.05));
    for (const [a, b] of segs) {
      const len = b - a, mid = (a + b) / 2;
      const px = horiz ? mid : ax + (nx * t) / 2, py = horiz ? ay + (ny * t) / 2 : mid;
      g.add(gbox(horiz ? len : t, H, horiz ? t : len, mat, X(px), z + H / 2, Z(py), { cast: false }));
    }
  }
}

// painted skirting board along the walls of a room, open at doorways
function skirting(room, mat, z, swings, g, walls) {
  const [x0, y0, x1, y1] = room.inner ?? room.rect;
  const H = 0.09, t = 0.016;
  const edges = [[x0, y0, x1, y0, 0, 1], [x0, y1, x1, y1, 0, -1], [x0, y0, x0, y1, 1, 0], [x1, y0, x1, y1, -1, 0]];
  for (const [ax, ay, bx, by, nx, ny] of edges) {
    const horiz = ay === by;
    const cuts = swings.filter((s) => overlap(s, [Math.min(ax, bx) - 0.08, Math.min(ay, by) - 0.08, Math.max(ax, bx) + 0.08, Math.max(ay, by) + 0.08]))
      .map((s) => (horiz ? [s[0] - 0.05, s[2] + 0.05] : [s[1] - 0.05, s[3] + 0.05]));
    let segs = [[horiz ? ax : ay, horiz ? bx : by]];
    for (const [c0, c1] of cuts) segs = segs.flatMap(([a, b]) => (c1 <= a || c0 >= b ? [[a, b]] : [[a, c0], [c1, b]]).filter(([p, q]) => q - p > 0.1));
    // keep only the stretches with a real wall right behind them (irregular rooms' rectangles cross open floor)
    const backed = (v) => {
      const px = horiz ? v : ax - nx * 0.06, py = horiz ? ay - ny * 0.06 : v;
      return walls.some((w) => px > w[0] - 0.03 && px < w[2] + 0.03 && py > w[1] - 0.03 && py < w[3] + 0.03);
    };
    const runs = [];
    for (const [a, b] of segs) {
      let s0 = null;
      for (let v = a; v <= b + 1e-6; v += 0.05) {
        const ok = backed(Math.min(v, b));
        if (ok && s0 === null) s0 = v;
        if ((!ok || v + 0.05 > b) && s0 !== null) { const e = ok ? b : v; if (e - s0 > 0.15) runs.push([s0, e]); s0 = null; }
      }
    }
    for (const [a, b] of runs) {
      const len = b - a, mid = (a + b) / 2;
      const px = horiz ? mid : ax + (nx * t) / 2, py = horiz ? ay + (ny * t) / 2 : mid;
      g.add(gbox(horiz ? len : t, H, horiz ? t : len, mat, X(px), z + H / 2, Z(py), { cast: false }));
    }
  }
}

// ---------- apartment ----------
// Builds the furnished interior of one apartment type (unit number on one floor-plan sheet) at height 0;
// every apartment of that type, on any floor, reuses it. Time-sliced: yields to the browser every 8 ms
// (half a 60 fps frame) so building never stalls the view.
// MessageChannel yields aren't clamped like setTimeout (1 s per call in hidden tabs)
const channel = new MessageChannel();
const queue = [];
channel.port1.onmessage = () => queue.shift()?.();
const slice = () => new Promise((r) => { queue.push(r); channel.port2.postMessage(0); });
// a breathe() to await in long loops: yields to the browser once `budget` ms have passed since the last yield
export function breather(budget = 8) {
  let t0 = performance.now();
  return async () => { if (performance.now() - t0 > budget) { await slice(); t0 = performance.now(); } };
}
export async function furnishUnit(floor, unitNumber, M, budget = 8) {
  const breathe = breather(budget);
  const g = new THREE.Group();
  const colliders = [];
  const rooms = classifyRooms(floor).filter((r) => r.unit.number === unitNumber);
  const solidLines = [...floor.sheet.walls, ...floor.sheet.openings.map((o) => o.rect)];
  const swings = floor.sheet.doorSwings ?? [];
  const z = 0, h = floor.h - 0.22;
  const accents = [];
  // nothing may stand within ~0.85 m of a doorway, arch or balcony door
  const clears = floor.sheet.openings.filter((o) => o.kind !== 'window').map(({ rect: r }) => {
    const horiz = r[2] - r[0] >= r[3] - r[1];
    return horiz ? [r[0] - 0.05, r[1] - 0.85, r[2] + 0.05, r[3] + 0.85] : [r[0] - 0.85, r[1] - 0.05, r[2] + 0.85, r[3] + 0.05];
  });
  let seed = unitNumber * 13;
  for (const room of rooms) {
    seed++;
    await breathe();
    if (room.type === 'balcony') {
      floorFinish(room, M.deck, z, g);
      const F = frame(room.rect, room.side, [], z);
      balcony(M, F, seed);
      g.add(F.group);
      colliders.push(...F.colliders);
      continue;
    }
    if (room.type === 'bath') {
      floorFinish(room, M.stone, z, g);
      tileWalls(room, M.wallTile, z, swings, g, h);
      bathroom(M, room, floor.sheet.fixtures ?? [], z, h, g, colliders);
      continue;
    }
    floorFinish(room, M.oak, z, g);
    skirting(room, M.trim, z, swings, g, floor.sheet.walls);
    const F = frame(room.rect, room.type === 'hall' ? null : room.side, swings, z, solidLines, room.rects, clears);
    F.windowless = !windowSide(room, floor.sheet.openings); // no curtains on a blank wall
    if (room.type === 'living') living(M, F, h, seed);
    else if (room.type === 'bedroom') bedroom(M, F, h, seed, room.kids);
    else hall(M, F);
    g.add(F.group);
    colliders.push(...F.colliders);
    accents.push(...F.accents);
  }
  // base oak floor under the whole flat: fills doorways and slivers no room covers
  const unit = floor.units.find((u) => u.number === unitNumber);
  for (const r of unit?.rects ?? []) {
    const r2 = [Math.max(r[0], floor.box[0]), Math.max(r[1], floor.box[1]), Math.min(r[2], floor.box[2]), Math.min(r[3], floor.box[3])];
    if (r2[2] <= r2[0] || r2[3] <= r2[1]) continue;
    const geo = new THREE.PlaneGeometry(r2[2] - r2[0], r2[3] - r2[1]).rotateX(-Math.PI / 2);
    geo.translate(X((r2[0] + r2[2]) / 2), z + 0.003, Z((r2[1] + r2[3]) / 2));
    g.add(mesh(geo, M.oak, { cast: false }));
  }
  addDoors(floor, unitNumber, M, g, colliders);
  const group = await merge(g, breathe);
  return { group, colliders, rooms, accents };
}

// Common corridor / lift lobby of a floor-plan sheet (built once per sheet, at height 0).
export async function furnishCommon(floor, M) {
  const g = new THREE.Group();
  // (floor 1's hall is too big for the area limit below: it is left unfurnished)
  const rooms = (floor.sheet.rooms ?? []).filter((r) => r.area > 8 && r.area < 200 && !floor.units.some((u) => u.kind === 'apartment' && u.rects.some((q) => inside(q, r.label[0], r.label[1]))));
  const solidLines = [...floor.sheet.walls, ...floor.sheet.openings.map((o) => o.rect)];
  const swings = floor.sheet.doorSwings ?? [];
  let seed = 3;
  const breathe = breather();
  for (const r of rooms) {
    await breathe();
    const room = { ...r, rect: r.inner ?? r.bbox };
    floorFinish(room, M.stone, 0, g);
    skirting(room, M.trim, 0, swings, g, floor.sheet.walls);
    const [x0, y0, x1, y1] = room.rect;
    const F = frame(room.rect, x1 - x0 > y1 - y0 ? 'west' : 'north', swings, 0, solidLines);
    // long runner down the middle, plants at both ends, a bench with a print above it where there is room
    if (F.W >= 1.0 && F.L >= 2) F.put(Fn.rug(M, Math.min(1.0, F.W - 0.5), F.L - 0.8), F.W / 2, F.L / 2, 'in', 1, F.L - 0.8, { solid: false, check: false, reserve: false, snap: false });
    for (const d of [0.35, F.L - 0.35]) {
      const p = real(M, (seed++ % 2) ? 'potted_plant_01' : 'potted_plant_02', { h: 1.1 }, () => Fn.plant(M, 1.2, 'fiddle', 'white', seed));
      F.put(p, 0.3, d, 'right', 0.5, 0.5);
    }
    if (F.L > 4 && F.W > 1.6) {
      const bench = new THREE.Group();
      bench.add(gbox(1.2, 0.05, 0.38, M.oakVeneer, 0, 0.44, 0, { r: 0.01 }));
      for (const s of [-1, 1]) bench.add(gbox(0.04, 0.42, 0.34, M.blackMetal, s * 0.52, 0.21, 0));
      if (F.put(bench, F.W - 0.22, F.L / 2, 'left', 1.2, 0.4)) F.put(Fn.art(M, 0.9, 0.6, seed % 2), F.W - 0.02, F.L / 2, 'left', 1, 0.03, { solid: false, check: false, reserve: false, y: 1.5 });
    }
    g.add(F.group);
  }
  return { group: await merge(g, breathe) };
}

// Closed (locked) doors in every doorway of the flat, taken from the door openings found in the plan:
// they keep each room's view to itself, and they are colliders, so rooms are reached via the
// arrows, plan or tour.
function addDoors(floor, unitNumber, M, g, colliders) {
  const unit = floor.units.find((u) => u.number === unitNumber);
  if (!unit) return;
  const inUnit = (x, y) => unit.rects.some((q) => x > q[0] - 0.15 && x < q[2] + 0.15 && y > q[1] - 0.15 && y < q[3] + 0.15);
  const H = 2.1, lt = 0.03, aw = 0.07, at = 0.016;
  // rooms that belong to no flat are the common corridor / lobby: a door touching one is the front door
  const common = (floor.sheet.rooms ?? []).filter((r) => r.area > 8 && !floor.units.some((u) => u.kind === 'apartment' && u.rects.some((q) => inside(q, r.label[0], r.label[1]))));
  for (const o of floor.sheet.openings) {
    if (o.kind !== 'door') continue;
    const [x0, y0, x1, y1] = o.rect;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    if (!inUnit(cx, cy)) continue;
    const along = Math.max(x1 - x0, y1 - y0), horiz = x1 - x0 >= y1 - y0;
    if (along < 0.6 || along > (floor.showflat ? 2.0 : 1.4)) continue; // wider gaps are open arches
    const t = Math.max(0.1, Math.min(x1 - x0, y1 - y0)); // wall thickness
    const d = new THREE.Group();
    const front = common.some((r) => r.rects.some((q) => overlap(q, [x0 - 0.12, y0 - 0.12, x1 + 0.12, y1 + 0.12])));
    const leafMat = front ? M.walnutVeneer : M.oakVeneer;
    // frame lining across the wall thickness
    for (const sx of [-1, 1]) d.add(gbox(lt, H + lt, t + 0.01, M.oakVeneer, sx * (along / 2 - lt / 2), (H + lt) / 2, 0));
    d.add(gbox(along, lt, t + 0.01, M.oakVeneer, 0, H + lt / 2, 0));
    // painted architraves on both faces
    for (const sz of [-1, 1]) {
      const zf = sz * (t / 2 + at / 2);
      for (const sx of [-1, 1]) d.add(gbox(aw, H + aw, at, M.trim, sx * (along / 2 + aw / 2 - 0.01), (H + aw) / 2, zf));
      d.add(gbox(along + aw * 2 - 0.02, aw, at, M.trim, 0, H + aw / 2, zf));
    }
    // flush oak-veneer leaf with a 3 mm shadow gap
    const lw = along - lt * 2 - 0.006, lh = H - 0.012;
    d.add(gbox(lw, lh, front ? 0.06 : 0.04, leafMat, 0, lh / 2 + 0.008, 0));
    if (front) {
      // brass number plate and pull on the corridor side, spy-hole
      for (const sz of [-1, 1]) d.add(gbox(0.12, 0.07, 0.006, M.brass, 0, 1.55, sz * 0.033, { r: 0.004 }));
      for (const sz of [-1, 1]) d.add(cyl(0.008, 0.008, 0.01, M.brass, 0, 1.45, sz * 0.032, 12).rotateX(Math.PI / 2));
    }
    // lever handles with round roses on both sides; three hinges on the other edge
    const hx = lw / 2 - 0.07;
    for (const sz of [-1, 1]) {
      const rose = cyl(0.026, 0.026, 0.008, M.blackMetal, hx, 1.02, sz * 0.024, 24);
      rose.rotation.x = Math.PI / 2;
      d.add(rose);
      d.add(gbox(0.018, 0.018, 0.05, M.blackMetal, hx, 1.02, sz * 0.045, { r: 0.006 }));
      d.add(gbox(0.14, 0.018, 0.018, M.blackMetal, hx - 0.07, 1.02, sz * 0.068, { r: 0.008 }));
      const keyRose = cyl(0.014, 0.014, 0.006, M.blackMetal, hx, 0.9, sz * 0.023, 16);
      keyRose.rotation.x = Math.PI / 2;
      d.add(keyRose);
    }
    for (const hy of [0.25, 1.05, 1.85]) d.add(gbox(0.012, 0.1, 0.03, M.blackMetal, -lw / 2 - 0.002, hy, 0));
    const holder = new THREE.Group();
    holder.position.set(X(cx), 0, Z(cy));
    holder.rotation.y = horiz ? 0 : Math.PI / 2;
    holder.add(d);
    g.add(holder);
    colliders.push({ x0: X(x0), x1: X(x1), z0: Z(y0), z1: Z(y1) });
  }
}

// Bake everything into one indexed mesh per material: a floor holds thousands of small parts.
async function merge(g, breathe) {
  g.updateMatrixWorld(true);
  const by = new Map();
  const meshes = [];
  g.traverse((o) => { if (o.isMesh) meshes.push(o); });
  for (const o of meshes) {
    const geo = o.geometry.clone();
    geo.applyMatrix4(o.matrixWorld);
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    if (!geo.index) geo.setIndex([...Array(geo.attributes.position.count).keys()]);
    if (!by.has(o.material)) by.set(o.material, []);
    by.get(o.material).push(geo);
    await breathe();
  }
  const out = new THREE.Group();
  for (const [mat, list] of by) {
    const m = new THREE.Mesh(mergeGeometries(list), mat);
    m.castShadow = !mat.transparent;
    m.receiveShadow = true;
    out.add(m);
    list.forEach((x) => x.dispose());
    await breathe();
  }
  return out;
}
