// Turns plan data (walls, openings, rooms) into 3D geometry.
import * as THREE from 'three';
import { box, cyl, mesh, group, piecesAround, curtainGeo, projectUV } from './geo.js';

export function buildUnit(unit, M) {
  const H = unit.height;
  const root = new THREE.Group();
  const ceilings = new THREE.Group();
  const colliders = [];
  const indoor = unit.rooms.filter((r) => !r.outdoor);
  const bx0 = Math.min(...indoor.map((r) => r.rect[0])), bz0 = Math.min(...indoor.map((r) => r.rect[1]));
  const bx1 = Math.max(...indoor.map((r) => r.rect[2])), bz1 = Math.max(...indoor.map((r) => r.rect[3]));
  const center = new THREE.Vector2((bx0 + bx1) / 2, (bz0 + bz1) / 2);

  // ---------- walls ----------
  for (const w of unit.walls) {
    const horiz = w.a[1] === w.b[1];
    const L = horiz ? w.b[0] - w.a[0] : w.b[1] - w.a[1];
    // local frame: +x along the wall, +z is the wall normal (world +z for horizontal, world -x for vertical)
    const g = group(w.a[0], 0, w.a[1], horiz ? 0 : -Math.PI / 2);
    const n = horiz ? [0, 1] : [-1, 0];
    const mid = horiz ? [w.a[0] + L / 2, w.a[1]] : [w.a[0], w.a[1] + L / 2];
    const inside = Math.sign((center.x - mid[0]) * n[0] + (center.y - mid[1]) * n[1]) || 1;
    const e = w.t / 2;
    const toWorld = (u0, u1, z0, z1) => horiz
      ? { x0: w.a[0] + u0, x1: w.a[0] + u1, z0: w.a[1] + z0, z1: w.a[1] + z1 }
      : { x0: w.a[0] - z1, x1: w.a[0] - z0, z0: w.a[1] + u0, z1: w.a[1] + u1 };

    for (const p of piecesAround(L + e, H, w.openings, -e)) {
      g.add(box(p.u1 - p.u0, p.y1 - p.y0, w.t, M.plaster, (p.u0 + p.u1) / 2, (p.y0 + p.y1) / 2, 0));
      if (p.y0 < 1.0) colliders.push(toWorld(p.u0, p.u1, -e, e));
    }
    if (w.exterior) {
      // facade skin on the outside face, running past the floor slab
      const skin = piecesAround(L + e + 0.02, H + 0.3, w.openings.map((o) => ({ ...o, sill: o.sill + 0.3, head: o.head + 0.3 })), -e - 0.02);
      for (const p of skin) {
        g.add(box(p.u1 - p.u0, p.y1 - p.y0, 0.02, M.plasterExt, (p.u0 + p.u1) / 2, (p.y0 + p.y1) / 2 - 0.3, -inside * (e + 0.01)));
      }
    }
    for (const o of w.openings) {
      g.add(buildOpening(o, w, inside, M, H));
      if (o.type === 'entry') colliders.push(toWorld(o.from, o.to, -e, e));
    }
    root.add(g);
  }

  // ---------- slabs, floors, ceiling ----------
  root.add(box(bx1 - bx0 + 0.29, 0.3, bz1 - bz0 + 0.29, M.concrete, center.x, -0.155, center.y));
  ceilings.add(box(bx1 - bx0 + 0.25, 0.25, bz1 - bz0 + 0.25, M.ceiling, center.x, H + 0.125, center.y));

  const halfT = (axis, at, lo, hi) => {
    let t = 0;
    for (const w of unit.walls) {
      const horiz = w.a[1] === w.b[1];
      if (axis === 'z' && horiz && Math.abs(w.a[1] - at) < 1e-6 && w.a[0] < hi && w.b[0] > lo) t = Math.max(t, w.t / 2);
      if (axis === 'x' && !horiz && Math.abs(w.a[0] - at) < 1e-6 && w.a[1] < hi && w.b[1] > lo) t = Math.max(t, w.t / 2);
    }
    return t;
  };
  // openings of collinear walls, expressed in an edge's local coordinate
  const edgeOpenings = (axis, at, start) => {
    const out = [];
    for (const w of unit.walls) {
      const horiz = w.a[1] === w.b[1];
      if (axis === 'z' && horiz && Math.abs(w.a[1] - at) < 1e-6) for (const o of w.openings) out.push({ ...o, from: w.a[0] + o.from - start, to: w.a[0] + o.to - start });
      if (axis === 'x' && !horiz && Math.abs(w.a[0] - at) < 1e-6) for (const o of w.openings) out.push({ ...o, from: w.a[1] + o.from - start, to: w.a[1] + o.to - start });
    }
    return out;
  };

  const labels = [];
  const rooms = {};
  for (const r of unit.rooms) {
    const [x0, z0, x1, z1] = r.rect;
    const geo = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
    geo.rotateX(-Math.PI / 2);
    geo.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
    const floor = mesh(geo, M[r.floor], { cast: false });
    floor.userData.room = r.id;
    root.add(floor);
    if (r.outdoor) root.add(box(x1 - x0, 0.22, z1 - z0, M.concrete, (x0 + x1) / 2, -0.115, (z0 + z1) / 2));

    const inner = {
      x0: x0 + halfT('x', x0, z0, z1), x1: x1 - halfT('x', x1, z0, z1),
      z0: z0 + halfT('z', z0, x0, x1), z1: z1 - halfT('z', z1, x0, x1),
    };
    rooms[r.id] = { ...r, inner };
    labels.push({ id: r.id, name: r.name, area: (x1 - x0) * (z1 - z0), pos: new THREE.Vector3((x0 + x1) / 2, 0, (z0 + z1) / 2) });
    if (r.outdoor) continue;

    // skirting boards, or full-height tile cladding in wet rooms
    const finish = r.wallFinish ? M[r.wallFinish.material] : M.skirting;
    const fh = r.wallFinish ? r.wallFinish.height : 0.08;
    const ft = r.wallFinish ? 0.01 : 0.014;
    const edges = [
      { axis: 'z', at: z0, face: inner.z0, s: 1, a: inner.x0, b: inner.x1 },
      { axis: 'z', at: z1, face: inner.z1, s: -1, a: inner.x0, b: inner.x1 },
      { axis: 'x', at: x0, face: inner.x0, s: 1, a: inner.z0, b: inner.z1 },
      { axis: 'x', at: x1, face: inner.x1, s: -1, a: inner.z0, b: inner.z1 },
    ];
    for (const ed of edges) {
      const ops = edgeOpenings(ed.axis, ed.at, ed.a);
      for (const p of piecesAround(ed.b - ed.a, fh, ops)) {
        const len = p.u1 - p.u0, h = p.y1 - p.y0, c = ed.a + (p.u0 + p.u1) / 2, off = ed.face + ed.s * ft / 2;
        const m = ed.axis === 'z'
          ? box(len, h, ft, finish, c, p.y0 + h / 2, off)
          : box(ft, h, len, finish, off, p.y0 + h / 2, c);
        root.add(m);
      }
    }

    // recessed downlights on a grid
    const nx = Math.max(1, Math.round((inner.x1 - inner.x0) / 1.8)), nz = Math.max(1, Math.round((inner.z1 - inner.z0) / 1.8));
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const lx = inner.x0 + ((i + 0.5) / nx) * (inner.x1 - inner.x0);
      const lz = inner.z0 + ((j + 0.5) / nz) * (inner.z1 - inner.z0);
      ceilings.add(cyl(0.05, 0.05, 0.008, M.downlight, lx, H - 0.003, lz, 24, { cast: false }));
      ceilings.add(cyl(0.062, 0.062, 0.004, M.steel, lx, H - 0.001, lz, 24, { cast: false }));
    }
  }

  root.add(ceilings);
  return { root, ceilings, colliders, labels, rooms, center, bounds: { x0: bx0, z0: bz0, x1: bx1, z1: bz1 } };
}

// Window, door and slider joinery, built in the wall's local frame.
function buildOpening(o, w, inside, M, H) {
  const g = new THREE.Group();
  const t = w.t, wd = o.to - o.from, cu = (o.from + o.to) / 2, oh = o.head - o.sill;

  const frameRect = (x, y, fw, fh, bar, depth, z, mat) => {
    g.add(box(fw, bar, depth, mat, x, y + fh - bar / 2, z));
    g.add(box(fw, bar, depth, mat, x, y + bar / 2, z));
    g.add(box(bar, fh, depth, mat, x - fw / 2 + bar / 2, y + fh / 2, z));
    g.add(box(bar, fh, depth, mat, x + fw / 2 - bar / 2, y + fh / 2, z));
  };
  const pane = (x, y, pw, ph, z) => {
    const m = box(pw, ph, 0.01, M.glass, x, y, z, { cast: false });
    g.add(m);
  };

  if (o.type === 'window') {
    const z = -inside * 0.03, bar = 0.055;
    frameRect(cu, o.sill, wd, oh, bar, 0.08, z, M.frame);
    const split = wd > 1.5 ? 2 : 1;
    const cw = (wd - bar * 2) / split;
    for (let i = 0; i < split; i++) {
      const x = o.from + bar + cw * (i + 0.5);
      pane(x, o.sill + oh / 2, cw - (split > 1 ? 0.03 : 0), oh - bar * 2, z);
      if (i > 0) g.add(box(0.05, oh - bar * 2, 0.08, M.frame, o.from + bar + cw * i, o.sill + oh / 2, z));
    }
    if (o.sill > 0.2) {
      // stone sill on the room side
      const d = t / 2 + 0.05;
      g.add(box(wd + 0.06, 0.03, d, M.marble, cu, o.sill - 0.015, inside * d / 2));
    }
  } else if (o.type === 'slider') {
    const bar = 0.06;
    frameRect(cu, 0, wd, oh, bar, 0.1, -inside * 0.02, M.frame);
    const sw = wd / 2 + 0.03;
    for (const [k, dz] of [[-1, -0.045], [1, 0.005]]) {
      const x = cu + k * (wd / 4 - 0.015);
      const z = -inside * 0.02 + dz;
      frameRect(x, bar, sw - bar, oh - bar * 2, 0.05, 0.035, z, M.frame);
      pane(x, oh / 2, sw - bar - 0.1, oh - bar * 2 - 0.1, z);
    }
    g.add(box(wd, 0.015, t + 0.04, M.frame, cu, 0.0075, 0));
  } else if (o.type === 'door' || o.type === 'entry') {
    const lining = o.type === 'entry' ? M.walnut : M.doorWhite;
    const lt = 0.03;
    g.add(box(lt, o.head, t + 0.02, lining, o.from + lt / 2, o.head / 2, 0));
    g.add(box(lt, o.head, t + 0.02, lining, o.to - lt / 2, o.head / 2, 0));
    g.add(box(wd, lt, t + 0.02, lining, cu, o.head - lt / 2, 0));
    // architraves on both faces
    for (const s of [-1, 1]) {
      const z = s * (t / 2 + 0.016);
      g.add(box(0.07, o.head + 0.035, 0.012, M.doorWhite, o.from - 0.02, (o.head + 0.035) / 2, z));
      g.add(box(0.07, o.head + 0.035, 0.012, M.doorWhite, o.to + 0.02, (o.head + 0.035) / 2, z));
      g.add(box(wd + 0.11, 0.07, 0.012, M.doorWhite, cu, o.head + 0.035, z));
    }
    const lw = wd - lt * 2 - 0.006, lh = o.head - lt - 0.01;
    const leafMat = o.type === 'entry' ? M.walnut : M.doorWhite;
    const leaf = new THREE.Group();
    const hs = o.type === 'entry' || o.hinge !== 'to' ? 1 : -1;
    leaf.add(box(lw, lh, 0.04, leafMat, hs * lw / 2, lh / 2 + 0.008, 0));
    for (const s of [-1, 1]) {
      const hx = hs * (lw - 0.07), hz = s * 0.03;
      leaf.add(cyl(0.025, 0.025, 0.01, M.blackMetal, hx, 1.0, hz, 20).rotateX(Math.PI / 2));
      leaf.add(box(0.13, 0.016, 0.018, M.blackMetal, hx - hs * 0.055, 1.0, s * 0.045, { r: 0.006 }));
    }
    if (o.type === 'entry') {
      leaf.position.set(o.from + lt + 0.003, 0, 0);
    } else {
      const sw = o.swing ?? 1;
      leaf.position.set(o.hinge === 'to' ? o.to - lt - 0.003 : o.from + lt + 0.003, 0, sw * (t / 2 - 0.02));
      leaf.rotation.y = sw * THREE.MathUtils.degToRad(92) * (o.hinge === 'to' ? 1 : -1);
    }
    g.add(leaf);
  }

  // curtains on living-space windows
  if (w.exterior && (o.type === 'window' || o.type === 'slider') && o.sill < 1.2) {
    const z = inside * (t / 2 + 0.12);
    const over = 0.22, pw = 0.5;
    g.add(cyl(0.012, 0.012, wd + over * 2 + 0.1, M.blackMetal, cu, H - 0.07, z, 12).rotateZ(Math.PI / 2));
    const ch = H - 0.1;
    for (const x of [o.from - over + pw / 2 - 0.05, o.to + over - pw / 2 + 0.05]) {
      const c = mesh(curtainGeo(pw, ch, 3.5), M.curtain, { cast: true });
      c.position.set(x, 0.015 + ch / 2, z);
      g.add(c);
    }
  }
  return g;
}

export { projectUV };
