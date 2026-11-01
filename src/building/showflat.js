// Show-flat: the walk-through version of an apartment, built for advertising rather than survey accuracy.
// The plan is enlarged by SCALE around the flat's centre (rooms gain floor space) while wall thickness,
// furniture, doors and sanitary fixtures keep real-world sizes. Ceilings are a little higher and get a
// lighting design: plaster bulkhead with a warm LED cove, recessed downlights washing the walls, and a
// warm light source per room. The overhead/dollhouse view and the m² figures stay true to the drawings.
import * as THREE from 'three';
import { mergeGeometries as BufferGeometryUtilsMerge } from 'three/addons/utils/BufferGeometryUtils.js';
import { box as gbox, cyl, mesh } from '../geo.js';
import { furnishUnit } from './interior.js';
import { CX, CY } from './model.js';

export const SCALE = 1.35;
const CEIL = 3.0; // m, show-flat clear height
const X = (x) => x - CX, Z = (y) => y - CY;

// ---------- plan scaling ----------
function scaler(c, k) {
  // rect: thin dimensions (walls, frames) keep their thickness unless `full`; `keepSize` moves only the centre
  return (r, { full = false, keepSize = false } = {}) => {
    const cx = (r[0] + r[2]) / 2, cy = (r[1] + r[3]) / 2, w = r[2] - r[0], h = r[3] - r[1];
    const nw = keepSize || (!full && w < 0.4) ? w : w * k, nh = keepSize || (!full && h < 0.4) ? h : h * k;
    const ncx = c[0] + (cx - c[0]) * k, ncy = c[1] + (cy - c[1]) * k;
    return [ncx - nw / 2, ncy - nh / 2, ncx + nw / 2, ncy + nh / 2];
  };
}
const near = (r, b, m) => r[0] < b[2] + m && r[2] > b[0] - m && r[1] < b[3] + m && r[3] > b[1] - m;

function scaledFloor(floor, unit, k) {
  let b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const q of unit.rects) b = [Math.min(b[0], q[0]), Math.min(b[1], q[1]), Math.max(b[2], q[2]), Math.max(b[3], q[3])];
  const c = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
  const S = scaler(c, k);
  const sh = floor.sheet;
  const area = [b[0] - 1, b[1] - 1.5, b[2] + 1, b[3] + 1.5]; // the flat plus its balconies
  const sheet = {
    ...sh,
    walls: sh.walls.filter((r) => near(r, area, 0)).map((r) => S(r)),
    openings: sh.openings.filter((o) => near(o.rect, area, 0)).map((o) => ({ ...o, rect: S(o.rect) })),
    balconies: (sh.balconies ?? []).filter((r) => near(r, area, 0)).map((r) => S(r, { full: true })),
    fixtures: (sh.fixtures ?? []).filter((f) => near(f.rect, area, 0)).map((f) => ({ ...f, rect: S(f.rect, { keepSize: true }) })),
    doorSwings: (sh.doorSwings ?? []).filter((r) => near(r, area, 0)).map((r) => S(r, { full: true })),
    rooms: (sh.rooms ?? []).filter((r) => near(r.bbox, area, 0)).map((r) => ({
      ...r,
      label: [c[0] + (r.label[0] - c[0]) * k, c[1] + (r.label[1] - c[1]) * k],
      bbox: S(r.bbox, { full: true }), inner: r.inner && S(r.inner, { full: true }), rects: r.rects.map((q) => S(q, { full: true })),
    })),
  };
  const su = { ...unit, rects: unit.rects.map((q) => S(q, { full: true })) };
  return { ...floor, sheet, units: [su], box: S(floor.box, { full: true }), h: CEIL + 0.22, sheetIndex: floor.sheetIndex, unit: su, showflat: true };
}

// ---------- light textures ----------
let glowTex, poolTex;
function glowTexture() {
  // soft rectangle glow, bright at the rim (light spilling out of a cove onto the ceiling)
  if (glowTex) return glowTex;
  const S = 256, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const img = g.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const e = Math.min(x, y, S - 1 - x, S - 1 - y) / (S / 2);
    const v = Math.pow(1 - Math.min(1, e / 0.45), 2.2);
    const i = (y * S + x) * 4;
    img.data[i] = 255; img.data[i + 1] = 214; img.data[i + 2] = 160; img.data[i + 3] = v * 255;
  }
  g.putImageData(img, 0, 0);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}
function poolTexture() {
  // downlight scallop on a wall: bright arc under the light, fading to nothing at the sides and bottom
  if (poolTex) return poolTex;
  const W = 128, H = 256, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const img = g.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const nx = (x + 0.5) / W * 2 - 1, ny = (y + 0.5) / H;
    const side = Math.max(0, 1 - nx * nx) ** 2.5;
    const arc = ny < 0.12 ? (ny / 0.12) ** 2 : Math.exp(-(ny - 0.12) * 3.2);
    const a = Math.min(1, side * arc);
    const i = (y * W + x) * 4;
    img.data[i] = 255; img.data[i + 1] = 222; img.data[i + 2] = 176; img.data[i + 3] = a * 255;
  }
  g.putImageData(img, 0, 0);
  poolTex = new THREE.CanvasTexture(c);
  poolTex.colorSpace = THREE.SRGBColorSpace;
  return poolTex;
}

// ---------- show-flat material kit ----------
let artTex;
function abstractArt(seed) {
  // contemporary abstract canvas: layered soft colour fields with brushed edges and a fine linen grain
  const W = 1024, Hh = 640, c = document.createElement('canvas');
  c.width = W; c.height = Hh;
  const g = c.getContext('2d');
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const palettes = [['#e9e2d6', '#c6a98a', '#8a7462', '#2f2a26', '#b78d6a'], ['#ece6dc', '#a9b0a6', '#5f6b62', '#d9c3a3', '#2b2d2c']];
  const p = palettes[seed % palettes.length];
  g.fillStyle = p[0];
  g.fillRect(0, 0, W, Hh);
  for (let i = 0; i < 7; i++) {
    g.globalAlpha = 0.55 + rnd() * 0.4;
    g.fillStyle = p[1 + (i % (p.length - 1))];
    g.beginPath();
    const cx = rnd() * W, cy = rnd() * Hh, r = 120 + rnd() * 260;
    if (i % 3 === 0) g.ellipse(cx, cy, r, r * (0.6 + rnd() * 0.5), rnd() * 3, 0, Math.PI * 2);
    else { g.moveTo(cx - r, cy + r * 0.4); g.bezierCurveTo(cx - r * 0.3, cy - r, cx + r * 0.6, cy - r * 0.2, cx + r, cy + r * 0.5); g.closePath(); }
    g.fill();
  }
  g.globalAlpha = 0.9;
  g.strokeStyle = p[3];
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(W * 0.15, Hh * 0.7);
  g.bezierCurveTo(W * 0.35, Hh * 0.2, W * 0.6, Hh * 0.9, W * 0.85, Hh * 0.35);
  g.stroke();
  const img = g.getImageData(0, 0, W, Hh);
  for (let i = 0; i < img.data.length; i += 4) { const n = (rnd() - 0.5) * 14; img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n; }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
let parquet;
function showflatKit(M) {
  const SM = { ...M };
  const std = (p) => new THREE.MeshStandardMaterial(p);
  SM.frameBlack = std({ color: 0x1a1a1a, roughness: 0.4, metalness: 0.85 });
  artTex ??= [abstractArt(1), abstractArt(2)];
  SM.artworks = artTex.map((t) => std({ map: t, roughness: 0.9, metalness: 0 }));
  // herringbone parquet with a light satin gloss
  if (!parquet) {
    const L = new THREE.TextureLoader();
    const tex = (f, srgb) => { const t = L.load(`/textures/ph/herringbone_parquet_${f}.webp`); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 8; t.userData.world = 2.6; return t; };
    parquet = std({ map: tex('diff', true), roughnessMap: tex('rough', false), normalMap: tex('nor', false), color: 0xe2cfb2, roughness: 0.45, envMapIntensity: 0.5, metalness: 0.05, normalScale: new THREE.Vector2(0.5, 0.5) });
  }
  SM.oak = parquet;
  // walls: matte off-white plaster (keeps the scanned plaster relief)
  SM.plaster = (base) => {
    const m = base.clone();
    m.color.set(0xf4f4f2).multiplyScalar(1.25); // the scan is darker than the paint
    m.roughness = 0.88;
    m.metalness = 0.02;
    return m;
  };
  return SM;
}

// ---------- shell: walls, window frames, ceiling, lighting ----------
export async function buildShowflat(floor, unit, M, wallMat) {
  const SF = scaledFloor(floor, unit, SCALE);
  const SM = showflatKit(M);
  wallMat = SM.plaster(wallMat);
  const tpl = await furnishUnit(SF, unit.number, SM);
  const g = new THREE.Group();
  g.add(tpl.group);
  const shell = new THREE.Group();
  const H = CEIL;
  const colliders = [...tpl.colliders];
  const wallColliders = [];
  let ub = [Infinity, Infinity, -Infinity, -Infinity];
  for (const q of SF.unit.rects) ub = [Math.min(ub[0], q[0]), Math.min(ub[1], q[1]), Math.max(ub[2], q[2]), Math.max(ub[3], q[3])];

  for (const r of SF.sheet.walls) {
    if ((r[2] - r[0]) * (r[3] - r[1]) < 0.003) continue;
    shell.add(gbox(r[2] - r[0], H, r[3] - r[1], wallMat, X((r[0] + r[2]) / 2), H / 2, Z((r[1] + r[3]) / 2)));
    const c = { x0: X(r[0]), x1: X(r[2]), z0: Z(r[1]), z1: Z(r[3]) };
    colliders.push(c); wallColliders.push(c);
  }
  const frameMat = M.frame ?? M.blackMetal;
  for (const o of SF.sheet.openings) {
    const r = o.rect, w = r[2] - r[0], d = r[3] - r[1], cx = X((r[0] + r[2]) / 2), cz = Z((r[1] + r[3]) / 2);
    if (o.kind === 'door') {
      shell.add(gbox(w, H - 2.15, d, wallMat, cx, (H + 2.15) / 2, cz));
      continue;
    }
    // facade opening: wall below the sill and above the head, glazing in a slim dark frame
    const sill = o.kind === 'window' ? 0.75 : 0, head = H - 0.3;
    if (sill > 0) shell.add(gbox(w, sill, d, wallMat, cx, sill / 2, cz));
    shell.add(gbox(w, H - head, d, wallMat, cx, (H + head) / 2, cz));
    const along = w > d, len = along ? w : d;
    const pane = (a, b, y0, y1) => gbox(along ? b - a : 0.012, y1 - y0, along ? 0.012 : b - a, M.glass, along ? X(r[0] + (a + b) / 2) : cx, (y0 + y1) / 2, along ? cz : Z(r[1] + (a + b) / 2), { cast: false });
    shell.add(pane(0, len, sill, head));
    const bar = (a, b, y0, y1) => shell.add(gbox(along ? b - a : 0.06, y1 - y0, along ? 0.06 : b - a, frameMat, along ? X(r[0] + (a + b) / 2) : cx, (y0 + y1) / 2, along ? cz : Z(r[1] + (a + b) / 2)));
    bar(0, 0.05, sill, head); bar(len - 0.05, len, sill, head);
    bar(0, len, sill, sill + 0.05); bar(0, len, head - 0.05, head);
    const n = Math.max(1, Math.round(len / 0.8));
    for (let i = 1; i < n; i++) bar((i / n) * len - 0.025, (i / n) * len + 0.025, sill, head);
    if (o.kind === 'window') shell.add(gbox(along ? w + 0.1 : 0.22, 0.03, along ? 0.22 : d + 0.1, M.stoneTop ?? M.marble, cx, sill + 0.015, cz));
    const c = { x0: X(r[0]), x1: X(r[2]), z0: Z(r[1]), z1: Z(r[3]) };
    colliders.push(c); wallColliders.push(c);
  }
  // balconies: slab + stone balustrade on the open sides
  for (const b of SF.sheet.balconies) {
    if ((b[3] - b[1]) < 0.4) continue;
    shell.add(gbox(b[2] - b[0], 0.25, b[3] - b[1], M.concrete, X((b[0] + b[2]) / 2), -0.13, Z((b[1] + b[3]) / 2)));
    const north = b[3] <= SF.box[1] + 0.3, edgeY = north ? b[1] : b[3];
    shell.add(gbox(b[2] - b[0], 1.0, 0.14, M.stoneTop ?? M.trim, X((b[0] + b[2]) / 2), 0.5, Z(edgeY)));
    for (const x of [b[0], b[2]]) shell.add(gbox(0.14, 1.0, b[3] - b[1], M.stoneTop ?? M.trim, X(x), 0.5, Z((b[1] + b[3]) / 2)));
    colliders.push({ x0: X(b[0]), x1: X(b[2]), z0: Z(edgeY) - 0.1, z1: Z(edgeY) + 0.1 });
  }
  // envelope: wherever the flat's outline has no wall from the plan (facade walls are drawn by the
  // building's facade, not the plan), close it with a wall just outside the outline, leaving openings open
  {
    const T = 0.24;
    const opens = SF.sheet.openings.map((o) => o.rect);
    for (const q of SF.unit.rects) {
      const edges = [[q[0], q[1], q[2], q[1], 0, -1], [q[0], q[3], q[2], q[3], 0, 1], [q[0], q[1], q[0], q[3], -1, 0], [q[2], q[1], q[2], q[3], 1, 0]];
      for (const [ax, ay, bx, by, nx, ny] of edges) {
        const horiz = ay === by;
        // skip edges shared with another rect of the same flat
        const mx = (ax + bx) / 2 + nx * 0.2, my = (ay + by) / 2 + ny * 0.2;
        if (SF.unit.rects.some((p) => p !== q && mx > p[0] && mx < p[2] && my > p[1] && my < p[3])) continue;
        // cut out openings that sit on this edge
        let segs = [[horiz ? ax : ay, horiz ? bx : by]];
        for (const o of opens) {
          const onEdge = horiz ? Math.abs((o[1] + o[3]) / 2 - ay) < 0.6 : Math.abs((o[0] + o[2]) / 2 - ax) < 0.6;
          if (!onEdge) continue;
          const [c0, c1] = horiz ? [o[0], o[2]] : [o[1], o[3]];
          segs = segs.flatMap(([a, b]) => (c1 <= a || c0 >= b ? [[a, b]] : [[a, c0], [c1, b]]).filter(([p, r]) => r - p > 0.02));
        }
        const e0 = horiz ? ax : ay, e1 = horiz ? bx : by;
        for (let [a, b] of segs) {
          // pieces touching the corners run past them so neighbouring edges meet without a gap
          if (Math.abs(a - e0) < 1e-6) a -= T + 0.06;
          if (Math.abs(b - e1) < 1e-6) b += T + 0.06;
          const len = b - a, mid = (a + b) / 2;
          const px = horiz ? mid : ax + nx * (T / 2 + 0.06), py = horiz ? ay + ny * (T / 2 + 0.06) : mid;
          shell.add(gbox(horiz ? len : T, H + 0.1, horiz ? T : len, wallMat, X(px), (H + 0.1) / 2, Z(py)));
          const c = horiz ? { x0: X(px - len / 2), x1: X(px + len / 2), z0: Z(py - T / 2), z1: Z(py + T / 2) } : { x0: X(px - T / 2), x1: X(px + T / 2), z0: Z(py - len / 2), z1: Z(py + len / 2) };
          colliders.push(c); wallColliders.push(c);
        }
        // above/below openings on this edge: lintel and (for windows) the wall under the sill
        for (const o of SF.sheet.openings) {
          const r = o.rect;
          const onEdge = horiz ? Math.abs((r[1] + r[3]) / 2 - ay) < 0.6 : Math.abs((r[0] + r[2]) / 2 - ax) < 0.6;
          if (!onEdge || o.kind === 'door') continue;
          const [c0, c1] = horiz ? [Math.max(r[0], ax), Math.min(r[2], bx)] : [Math.max(r[1], ay), Math.min(r[3], by)];
          if (c1 - c0 < 0.05) continue;
          const mid = (c0 + c1) / 2, len = c1 - c0;
          const px = horiz ? mid : ax + nx * (T / 2 + 0.06), py = horiz ? ay + ny * (T / 2 + 0.06) : mid;
          const add = (y0, y1) => shell.add(gbox(horiz ? len : T, y1 - y0, horiz ? T : len, wallMat, X(px), (y0 + y1) / 2, Z(py)));
          add(H - 0.3, H + 0.1);
          if (o.kind === 'window') add(0, 0.75);
        }
      }
    }
  }
  // ceiling over the flat
  shell.add(gbox(ub[2] - ub[0] + 0.6, 0.12, ub[3] - ub[1] + 0.6, M.ceiling, X((ub[0] + ub[2]) / 2), H + 0.06, Z((ub[1] + ub[3]) / 2), { cast: false }));

  // ---------- lighting design per room ----------
  const ledMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffd9a8, emissiveIntensity: 2.2 });
  const spotMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4e6, emissiveIntensity: 3 });
  const glowMat = new THREE.MeshBasicMaterial({ map: glowTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.55 });
  const poolMat = new THREE.MeshBasicMaterial({ map: poolTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.4, side: THREE.DoubleSide });
  const lights = new THREE.Group();
  for (const room of tpl.rooms) {
    if (room.type === 'balcony') continue;
    const q = room.inner ?? room.bbox, rw = q[2] - q[0], rd = q[3] - q[1];
    const cx = X((q[0] + q[2]) / 2), cz = Z((q[1] + q[3]) / 2);
    const bw = 0.32, bh = 0.14;
    const cove = room.type !== 'bath' && Math.min(rw, rd) > 2.0;
    if (cove) {
      // plaster bulkhead around the room, LED strip at its inner lip, glow spilling over the ceiling
      for (const [x0, z0, x1, z1] of [[q[0], q[1], q[2], q[1] + bw], [q[0], q[3] - bw, q[2], q[3]], [q[0], q[1] + bw, q[0] + bw, q[3] - bw], [q[2] - bw, q[1] + bw, q[2], q[3] - bw]]) {
        shell.add(gbox(x1 - x0, bh, z1 - z0, M.ceiling, X((x0 + x1) / 2), H - bh / 2, Z((z0 + z1) / 2), { cast: false }));
      }
      const iq = [q[0] + bw, q[1] + bw, q[2] - bw, q[3] - bw];
      for (const [x0, z0, x1, z1] of [[iq[0], iq[1], iq[2], iq[1] + 0.02], [iq[0], iq[3] - 0.02, iq[2], iq[3]], [iq[0], iq[1], iq[0] + 0.02, iq[3]], [iq[2] - 0.02, iq[1], iq[2], iq[3]]]) {
        shell.add(gbox(x1 - x0, 0.02, z1 - z0, ledMat, X((x0 + x1) / 2), H - bh + 0.01, Z((z0 + z1) / 2), { cast: false }));
      }
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(iq[2] - iq[0], iq[3] - iq[1]).rotateX(Math.PI / 2), glowMat);
      glow.position.set(X((iq[0] + iq[2]) / 2), H - 0.003, Z((iq[1] + iq[3]) / 2));
      glow.renderOrder = 3;
      lights.add(glow);
    }
    // recessed downlights along the walls (in the bulkhead where there is one), each washing the wall below
    const inset = cove ? bw / 2 : 0.35, y = cove ? H - bh - 0.002 : H - 0.002;
    const edges = [
      [q[0], q[1] + inset, q[2], q[1] + inset, 0, -1], [q[0], q[3] - inset, q[2], q[3] - inset, 0, 1],
      [q[0] + inset, q[1], q[0] + inset, q[3], -1, 0], [q[2] - inset, q[1], q[2] - inset, q[3], 1, 0],
    ];
    for (const [ax, ay, bx, by, nx, ny] of edges) {
      const len = Math.hypot(bx - ax, by - ay);
      if (len < 1.2 || (room.type === 'bath' && (nx !== 0))) continue;
      const n = Math.max(1, Math.round(len / 1.3));
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n, px = ax + (bx - ax) * t, py = ay + (by - ay) * t;
        // black anodized trim ring with a warm emissive lens
        shell.add(cyl(0.05, 0.05, 0.012, SM.frameBlack, X(px), y, Z(py), 24, { cast: false }));
        shell.add(cyl(0.027, 0.027, 0.014, spotMat, X(px), y - 0.002, Z(py), 20, { cast: false }));
        // scallop on the wall face behind
        const wx = px + nx * (inset - 0.012), wy = py + ny * (inset - 0.012);
        const pool = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 1.9), poolMat);
        pool.position.set(X(wx), y - 0.95, Z(wy));
        pool.rotation.y = nx !== 0 ? Math.PI / 2 : 0;
        pool.renderOrder = 3;
        lights.add(pool);
      }
    }
    // a real warm light per room so furniture and walls pick it up
    const area = rw * rd;
    if (area < 9 || room.type === 'bath') continue;
    const pl = new THREE.PointLight(0xffd6a6, Math.min(5, 1.2 + area * 0.18), Math.max(6, Math.max(rw, rd) * 1.6), 2);
    pl.position.set(cx, H - 0.45, cz);
    lights.add(pl);
  }
  // soft spotlights on the art and the feature wall
  for (const a of (tpl.accents ?? []).slice(0, 3)) {
    const sp = new THREE.SpotLight(0xfff5ea, 6, 4.5, 0.5, 0.8, 2);
    const off = 0.9; // fixture in the ceiling, ~0.9 m out from the wall
    sp.position.set(a.x + a.nx * off, H - 0.05, a.z + a.nz * off);
    sp.target.position.set(a.x, Math.max(1.2, a.y || 1.4), a.z);
    lights.add(sp, sp.target);
    shell.add(cyl(0.045, 0.045, 0.03, SM.frameBlack, sp.position.x, H - 0.015, sp.position.z, 20, { cast: false }));
  }
  g.add(merge(shell), lights);
  const units = SF.unit;
  return { group: g, colliders, wallColliders, rooms: tpl.rooms, sheet: SF.sheet, unit: units, h: H };
}

// merge the shell into one mesh per material (it is static)
function merge(group) {
  group.updateMatrixWorld(true);
  const by = new Map();
  group.traverse((o) => {
    if (!o.isMesh) return;
    const geo = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()).applyMatrix4(o.matrixWorld);
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
    if (!by.has(o.material)) by.set(o.material, []);
    by.get(o.material).push(geo);
  });
  const out = new THREE.Group();
  for (const [mat, list] of by) {
    const m = new THREE.Mesh(BufferGeometryUtilsMerge(list), mat);
    m.castShadow = !mat.transparent;
    m.receiveShadow = true;
    out.add(m);
  }
  return out;
}
