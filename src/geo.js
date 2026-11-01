// Small geometry helpers shared by the building generator and furniture.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// Box-projected UVs in meters so textures keep real-world scale on any size of object.
export function projectUV(geo, world = 1) {
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const ax = Math.abs(nor.getX(i)), ay = Math.abs(nor.getY(i)), az = Math.abs(nor.getZ(i));
    let u, v;
    if (ay >= ax && ay >= az) { u = x; v = z; }
    else if (ax >= az) { u = z; v = y; }
    else { u = x; v = y; }
    uv[i * 2] = u / world; uv[i * 2 + 1] = v / world;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

const worldOf = (mat) => mat.map?.userData.world ?? mat.normalMap?.userData.world ?? 1;

export function mesh(geo, mat, { cast = true, receive = true, uv = true, offset } = {}) {
  if (uv && mat.map !== undefined) projectUV(geo, worldOf(mat));
  if (offset) {
    // shift projected UVs so neighbouring objects don't share an identical grain
    const a = geo.attributes.uv;
    for (let i = 0; i < a.count; i++) a.setXY(i, a.getX(i) + offset[0], a.getY(i) + offset[1]);
  }
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

// Axis-aligned box from its min corner style dims, centered at (x, y, z). r > 0 gives rounded edges.
export function box(w, h, d, mat, x = 0, y = 0, z = 0, { r = 0, seg = 2, ...o } = {}) {
  const geo = r > 0
    ? new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4))
    : new THREE.BoxGeometry(w, h, d);
  if (o.offsetGeo) geo.translate(...o.offsetGeo);
  const m = mesh(geo, mat, o);
  m.position.set(x, y, z);
  return m;
}

export function cyl(rt, rb, h, mat, x = 0, y = 0, z = 0, seg = 32, o = {}) {
  const m = mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat, o);
  m.position.set(x, y, z);
  return m;
}

export function group(x = 0, y = 0, z = 0, rotY = 0, ...children) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  for (const c of children) g.add(c);
  return g;
}

// Splits a wall-like strip of length L and height H into solid rectangles around openings.
// openings: [{ from, to, sill, head }] in local coordinates.
export function piecesAround(L, H, openings, start = 0) {
  const ops = openings
    .map((o) => ({ ...o, from: Math.max(start, o.from), to: Math.min(L, o.to) }))
    .filter((o) => o.to > o.from)
    .sort((a, b) => a.from - b.from);
  const out = [];
  let cur = start;
  for (const o of ops) {
    if (o.from > cur) out.push({ u0: cur, u1: o.from, y0: 0, y1: H });
    if (o.sill > 0) out.push({ u0: o.from, u1: o.to, y0: 0, y1: Math.min(o.sill, H) });
    if (o.head < H) out.push({ u0: o.from, u1: o.to, y0: o.head, y1: H });
    cur = Math.max(cur, o.to);
  }
  if (cur < L) out.push({ u0: cur, u1: L, y0: 0, y1: H });
  return out.filter((p) => p.u1 - p.u0 > 1e-4 && p.y1 - p.y0 > 1e-4);
}

// A curtain panel with soft vertical folds.
export function curtainGeo(w, h, folds) {
  const geo = new THREE.PlaneGeometry(w, h, Math.max(24, folds * 8), 1);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    p.setZ(i, Math.sin(((x / w) + 0.5) * folds * Math.PI * 2) * 0.035);
  }
  geo.computeVertexNormals();
  return geo;
}
