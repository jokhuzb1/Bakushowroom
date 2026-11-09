// 360° tour stops for one show-flat: one panorama per real room, as a buyer thinks of it.
// - a bathroom split into WC + shower on the drawings is one stop (the largest part),
// - small halls and corridors fold into the room they open onto (living room first),
// - balconies too narrow to stand on are left out.
// Each stop gets a camera at eye level in the most open spot of the room, and hotspots to the
// neighbouring stops placed on the doorways between them, so the tour lines up with the plan.
import { NavAids, nameOf } from '../building/navaids.js';
import { CX, CY } from '../building/model.js';

export const EYE = 1.5;
const SMALL_HALL = 4.5; // m²

const clearance = (px, pz, solids) => {
  let d = Infinity;
  for (const c of solids) d = Math.min(d, Math.hypot(Math.max(c.x0 - px, 0, px - c.x1), Math.max(c.z0 - pz, 0, pz - c.z1)));
  return d;
};
const centre = (q) => [(q[0] + q[2]) / 2, (q[1] + q[3]) / 2];

// the most open standing spot of a room, pulled a little towards its middle (plan coords)
function cameraSpot(room, solids) {
  // the extracted rectangles of an open-plan room can be thin strips along its walls; the room's middle is
  // that of its largest rectangle, usually `inner` (the largest one that fits inside the room)
  const areas = [...(room.inner ? [room.inner] : []), ...room.rects];
  const big = [...areas].sort((a, b) => (b[2] - b[0]) * (b[3] - b[1]) - (a[2] - a[0]) * (a[3] - a[1]))[0];
  const mid = centre(big);
  let best = -Infinity, out = mid;
  for (const r of areas) {
    const mx = Math.min(0.35, (r[2] - r[0]) / 2), my = Math.min(0.35, (r[3] - r[1]) / 2);
    for (let x = r[0] + mx; x <= r[2] - mx + 1e-6; x += 0.1) {
      for (let y = r[1] + my; y <= r[3] - my + 1e-6; y += 0.1) {
        const free = clearance(x - CX, y - CY, solids);
        const score = Math.min(free, room.type === 'bath' ? 0.45 : 1.1) - 0.22 * Math.hypot(x - mid[0], y - mid[1]);
        if (score > best) { best = score; out = [x, y]; }
      }
    }
  }
  return out;
}

// rooms: show-flat rooms (plan coords); solids: colliders (world); walls: plan wall rects
export function tourStops(rooms, solids, walls) {
  const doors = NavAids.prototype.findDoorways.call(null, rooms, walls);
  // open-plan zones touch without a doorway: link them at the shared edge
  for (const a of rooms) for (const b of rooms) {
    if (a === b || a.doors || (doors.get(a) ?? []).some((l) => l.to === b)) continue;
    for (const p of a.rects) for (const q of b.rects) {
      const ox = Math.min(p[2], q[2]) - Math.max(p[0], q[0]), oy = Math.min(p[3], q[3]) - Math.max(p[1], q[1]);
      if (!((ox > 1 && Math.abs(oy) < 0.02) || (oy > 1 && Math.abs(ox) < 0.02))) continue;
      const c = [(Math.max(p[0], q[0]) + Math.min(p[2], q[2])) / 2, (Math.max(p[1], q[1]) + Math.min(p[3], q[3])) / 2];
      doors.set(a, [...(doors.get(a) ?? []), { to: b, c }]);
    }
  }
  const links = (r) => doors.get(r) ?? [];
  const alias = new Map(); // room -> the stop it is shown in
  // bathrooms: the parts of one bathroom (doorway between them, or touching) become one stop
  const baths = rooms.filter((r) => r.type === 'bath').sort((a, b) => b.area - a.area);
  for (const b of baths) {
    if (alias.has(b)) continue;
    for (const l of links(b)) if (l.to.type === 'bath' && !alias.has(l.to) && l.to.area <= b.area) alias.set(l.to, b);
  }
  // small halls fold into a neighbour: living room first, else the largest room they open onto
  for (const h of rooms.filter((r) => r.type === 'hall' && r.area < SMALL_HALL)) {
    const n = links(h).map((l) => l.to).filter((r) => r.type !== 'bath' && r.type !== 'balcony' && r !== h)
      .sort((a, b) => (b.type === 'living') - (a.type === 'living') || b.area - a.area)[0];
    if (n) alias.set(h, n);
  }
  for (const r of rooms) if (r.type === 'balcony' && Math.min(r.bbox[2] - r.bbox[0], r.bbox[3] - r.bbox[1]) < 0.9) alias.set(r, null);
  const resolve = (r) => { let x = r; for (let i = 0; i < 4 && alias.has(x); i++) x = alias.get(x); return x; };

  const shown = rooms.filter((r) => !alias.has(r));
  const order = { lobby: -1, living: 0, hall: 1, bedroom: 2, bath: 3, balcony: 4 };
  shown.sort((a, b) => (order[a.type] ?? 5) - (order[b.type] ?? 5) || (a.kids ? 1 : 0) - (b.kids ? 1 : 0) || b.area - a.area);
  const ids = new Map();
  const count = {};
  for (const r of shown) {
    const base = r.kids ? 'kids' : r.type;
    count[base] = (count[base] ?? 0) + 1;
    ids.set(r, count[base] > 1 ? `${base}${count[base]}` : base);
  }
  const named = {};
  const stops = shown.map((r) => {
    const [x, y] = r.cam ?? cameraSpot(r, solids);
    let name = nameOf(r);
    named[name] = (named[name] ?? 0) + 1;
    if (named[name] > 1) name = r.type === 'bath' && named[name] === 2 ? 'Guest bathroom' : `${name} ${named[name]}`;
    const parts = rooms.filter((o) => o === r || resolve(o) === r);
    return { id: ids.get(r), name, type: r.type, area: +parts.reduce((a, o) => a + o.area, 0).toFixed(1), plan: [x, y], cam: [x - CX, EYE, y - CY], room: r, parts };
  });
  const byRoom = new Map(stops.map((s) => [s.room, s]));
  // hotspots: every doorway out of any part of a stop that leads to a different stop
  for (const s of stops) {
    const seen = new Set();
    s.links = [];
    for (const p of s.parts) {
      for (const l of links(p)) {
        const to = resolve(l.to);
        const t = to && byRoom.get(to);
        if (!t || t === s || seen.has(t.id)) continue;
        seen.add(t.id);
        // aim at the floor just inside the doorway, like a footstep marker
        const dx = l.c[0] - CX - s.cam[0], dz = l.c[1] - CY - s.cam[2], dy = 0.35 - EYE;
        const n = Math.hypot(dx, dy, dz) || 1;
        s.links.push({ to: t.id, dir: [dx / n, dy / n, dz / n], door: l.c });
      }
    }
  }
  return stops;
}
