// In-apartment navigation aids: floating room signposts with arrows, glowing floor markers,
// a ring that follows the pointer over the floor, and an on-screen arrow pad.
import * as THREE from 'three';
import { CX, CY } from './model.js';

const NAMES = { living: 'Living & kitchen', bedroom: 'Bedroom', bath: 'Bathroom', hall: 'Hall', balcony: 'Balcony' };
const nameOf = (r) => r.name ?? (r.kids ? "Children's room" : NAMES[r.type] ?? 'Room');

export class NavAids {
  constructor({ scene, camera, canvas, layer, pad, walk, onGo, onChange = () => {} }) {
    Object.assign(this, { scene, camera, canvas, layer, walk, onGo, onChange });
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);
    this.spots = [];
    this.ray = new THREE.Raycaster();
    this.v = new THREE.Vector3();

    // floor marker: soft disc + ring + chevron
    this.discMat = new THREE.MeshBasicMaterial({ color: 0xffb259, transparent: true, opacity: 0.35, depthWrite: false });
    this.ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false });
    this.discGeo = new THREE.CircleGeometry(0.32, 40).rotateX(-Math.PI / 2);
    this.ringGeo = new THREE.RingGeometry(0.3, 0.36, 48).rotateX(-Math.PI / 2);

    // pointer ring on the floor
    this.cursor = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.26, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false }));
    this.cursor.add(new THREE.Mesh(new THREE.CircleGeometry(0.2, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18, depthWrite: false })));
    this.cursor.visible = false;
    this.cursor.renderOrder = 5;
    scene.add(this.cursor);
    canvas.addEventListener('pointermove', (e) => this.hover(e));
    // floor arrows at the doorways of the current room (click one to step through)
    const sh = new THREE.Shape();
    sh.moveTo(0, 0.34); sh.lineTo(0.3, -0.02); sh.lineTo(0.16, -0.02); sh.lineTo(0, 0.16);
    sh.lineTo(-0.16, -0.02); sh.lineTo(-0.3, -0.02); sh.closePath();
    const chevron = new THREE.ShapeGeometry(sh).rotateX(-Math.PI / 2);
    this.arrowGeo = chevron.scale(0.62, 1, 0.62);
    this.arrowMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthWrite: false });
    this.arrowBg = new THREE.CircleGeometry(0.28, 40).rotateX(-Math.PI / 2).scale(1, 1, 1);
    this.arrowBgMat = new THREE.MeshBasicMaterial({ color: 0x24211d, transparent: true, opacity: 0.45, depthWrite: false });
    this.exits = new THREE.Group();
    scene.add(this.exits);
    this.exitRoom = undefined;
    let down = null;
    canvas.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; }, true);
    canvas.addEventListener('pointerup', (e) => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5 || !this.exits.children.length) return;
      const r = canvas.getBoundingClientRect();
      this.ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
      this.ray.near = camera.near;
      const hit = this.ray.intersectObjects(this.exits.children, true)[0];
      this.ray.near = 0;
      if (!hit) return;
      let o = hit.object;
      while (o && !o.userData.room) o = o.parent;
      if (!o) return;
      e.stopImmediatePropagation();
      down = null;
      this.onGo(o.userData.room);
    }, true);
    canvas.addEventListener('pointerleave', () => { this.cursor.visible = false; });

    // arrow pad: press and hold to move / turn (drives the walk controller's key set)
    for (const b of pad.querySelectorAll('button')) {
      const code = b.dataset.key;
      const down = (e) => { e.preventDefault(); walk.target = null; walk.keys.add(code); b.classList.add('on'); };
      const up = () => { walk.keys.delete(code); b.classList.remove('on'); };
      b.addEventListener('pointerdown', down);
      b.addEventListener('pointerup', up);
      b.addEventListener('pointerleave', up);
      b.addEventListener('pointercancel', up);
    }
  }

  // rooms: [{ room, target: [x, z] world, ... }]
  open(views, floorZ, occluders, walls) {
    this.close();
    this.floorZ = floorZ;
    this.occluders = occluders;
    this.doorways = this.findDoorways(views.map((v) => v.room), walls);
    for (const v of views) {
      const m = new THREE.Group(); // anchor only: no floor disc, the sign above it is enough
      m.position.set(v.target[0], floorZ + 0.02, v.target[1]);
      m.renderOrder = 4;
      this.group.add(m);
      const el = document.createElement('button');
      el.className = 'sign';
      el.innerHTML = `<span class="arrow">➜</span><span class="txt">${nameOf(v.room)}<small>${v.room.area.toFixed(1)} m²</small></span>`;
      el.onclick = () => this.onGo(v.room);
      this.layer.append(el);
      this.spots.push({ ...v, marker: m, el });
    }
    this.group.visible = true;
  }

  close() {
    for (const s of this.spots) s.el.remove();
    this.group.clear();
    this.spots = [];
    this.clearExits();
    this.group.visible = false;
    this.cursor.visible = false;
  }

  clearExits() {
    for (const c of this.exits.children) c.userData.el?.remove();
    this.exits.clear();
    this.exitRoom = undefined;
  }

  // Doorways between rooms of the flat: free cells (not inside a wall) that lie close to two
  // different rooms. Works for doors and open arches alike; walls between rooms block it.
  findDoorways(rooms, walls) {
    const mid = (q) => [(q[0] + q[2]) / 2, (q[1] + q[3]) / 2];
    const out = new Map(rooms.map((r) => [r, []]));
    const dist = (r, x, y) => Math.min(...r.rects.map((q) => Math.hypot(Math.max(q[0] - x, 0, x - q[2]), Math.max(q[1] - y, 0, y - q[3]))));
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const r of rooms) for (const q of r.rects) { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[2]); y1 = Math.max(y1, q[3]); }
    const W = walls.filter((w) => w[2] > x0 - 1 && w[0] < x1 + 1 && w[3] > y0 - 1 && w[1] < y1 + 1);
    const pairs = new Map();
    const step = 0.06, reach = 0.32;
    for (let x = x0; x <= x1; x += step) {
      for (let y = y0; y <= y1; y += step) {
        if (W.some((w) => x > w[0] - 0.01 && x < w[2] + 0.01 && y > w[1] - 0.01 && y < w[3] + 0.01)) continue;
        const d = rooms.map((r) => dist(r, x, y));
        if (d.some((v) => v < 0.005)) continue; // inside a room: not part of an opening
        const close = rooms.filter((r, i) => d[i] < reach);
        for (let i = 0; i < close.length; i++) for (let j = i + 1; j < close.length; j++) {
          const key = [close[i], close[j]];
          const k = rooms.indexOf(close[i]) + ':' + rooms.indexOf(close[j]);
          if (!pairs.has(k)) pairs.set(k, { key, pts: [] });
          pairs.get(k).pts.push([x, y]);
        }
      }
    }
    const found = new Map();
    for (const { key: [a, b], pts } of pairs.values()) {
      // an opening must be at least ~0.5 m wide
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
      if (pts.length < 5 || span < 0.4) continue;
      const c = [xs.reduce((s, v) => s + v, 0) / pts.length, ys.reduce((s, v) => s + v, 0) / pts.length];
      found.set(a, [...(found.get(a) ?? []), { to: b, c }]);
      found.set(b, [...(found.get(b) ?? []), { to: a, c }]);
    }
    // circulation: rooms open off the hall (living room when a flat has no hall);
    // use a detected opening for the link when there is one, else the closest point to the hall
    const hubs = rooms.filter((r) => r.type === 'hall');
    if (!hubs.length) hubs.push(...rooms.filter((r) => r.type === 'living'));
    const closest = (r, h) => {
      let best = Infinity, c = null;
      for (const p of r.rects) for (const q of h.rects) {
        const x = Math.max(p[0], Math.min(q[0], q[2], p[2])), y = Math.max(p[1], Math.min(q[1], q[3], p[3]));
        const cx = Math.min(Math.max((Math.max(p[0], q[0]) + Math.min(p[2], q[2])) / 2, p[0]), p[2]);
        const cy = Math.min(Math.max((Math.max(p[1], q[1]) + Math.min(p[3], q[3])) / 2, p[1]), p[3]);
        const d = dist(h, cx, cy);
        if (d < best) { best = d; c = [cx, cy]; }
      }
      return c;
    };
    const link = (a, b) => {
      const hit = (found.get(a) ?? []).find((e) => e.to === b);
      const c = hit?.c ?? closest(a, b);
      if (c && !out.get(a).some((e) => e.to === b)) out.get(a).push({ to: b, c });
    };
    for (const r of rooms) {
      if (r.type === 'balcony') continue;
      if (hubs.includes(r)) {
        for (const o of rooms) if (o !== r && o.type !== 'balcony') link(r, o);
      } else {
        const hub = [...hubs].sort((p, q) => dist(p, ...mid(r.inner ?? r.bbox)) - dist(q, ...mid(r.inner ?? r.bbox)))[0];
        if (hub) link(r, hub);
      }
    }
    return out;
  }

  buildExits(room) {
    this.clearExits();
    this.exitRoom = room;
    if (!room) return;
    const mid = (q) => [(q[0] + q[2]) / 2, (q[1] + q[3]) / 2];
    for (const { to, c } of this.doorways.get(room) ?? []) {
      const tc = mid(to.inner ?? to.bbox), rc = mid(room.inner ?? room.bbox);
      // sit just inside the current room, pointing at the next room
      let dx = tc[0] - c[0], dy = tc[1] - c[1];
      const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
      const bx = rc[0] - c[0], by = rc[1] - c[1];
      const bl = Math.hypot(bx, by) || 1;
      const st = Math.min(0.18, bl * 0.2); // stay in the doorway, which furniture never blocks
      const px = c[0] + (bx / bl) * st, py = c[1] + (by / bl) * st;
      const g = new THREE.Group();
      const bg = new THREE.Mesh(this.arrowBg, this.arrowBgMat);
      const ar = new THREE.Mesh(this.arrowGeo, this.arrowMat);
      ar.position.y = 0.004;
      ar.rotation.y = Math.atan2(-dx, -dy); // chevron tip points -z before rotation
      g.add(bg, ar);
      g.position.set(px - CX, this.floorZ + 0.03, py - CY);
      g.renderOrder = 6;
      g.userData.room = to;
      const el = document.createElement('div');
      el.className = 'exit';
      el.textContent = nameOf(to);
      this.layer.append(el);
      g.userData.el = el;
      this.exits.add(g);
    }
  }

  blocked(ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az;
    for (const c of this.occluders) {
      let t0 = 0, t1 = 1;
      for (const [p, d, lo, hi] of [[ax, dx, c.x0, c.x1], [az, dz, c.z0, c.z1]]) {
        if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) { t0 = 2; break; } continue; }
        let a = (lo - p) / d, b = (hi - p) / d;
        if (a > b) [a, b] = [b, a];
        t0 = Math.max(t0, a); t1 = Math.min(t1, b);
        if (t0 > t1) break;
      }
      if (t0 <= t1 && t1 > 0.02 && t0 < 0.95) return true;
    }
    return false;
  }

  hover(e) {
    if (!this.group.visible || !this.walk.enabled) { this.cursor.visible = false; return; }
    const r = this.canvas.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.camera);
    this.ray.near = this.camera.near;
    const hit = this.ray.intersectObjects(this.walk.floors, true).find((h) => h.face && h.face.normal.y > 0.9 && Math.abs(h.point.y - this.floorZ) < 0.3);
    this.ray.near = 0;
    this.cursor.visible = !!hit && hit.distance < 14;
    if (hit) this.cursor.position.set(hit.point.x, this.floorZ + 0.025, hit.point.z);
    this.onChange();
  }

  update(t, currentRoom) {
    if (!this.group.visible) return;
    const cam = this.camera, W = innerWidth, H = innerHeight;
    if (currentRoom !== this.exitRoom && currentRoom) this.buildExits(currentRoom);
    for (const g of this.exits.children) {
      const p = g.position.clone().setY(this.floorZ + 0.05).project(cam);
      const el = g.userData.el;
      const sx = (p.x * 0.5 + 0.5) * W, sy = (-p.y * 0.5 + 0.5) * H;
      const show = p.z < 1 && sx > 30 && sx < W - 30 && sy > 30 && sy < H - 30;
      el.style.display = show ? '' : 'none';
      if (show) el.style.transform = `translate(-50%, 12px) translate(${sx}px, ${sy}px)`;
    }
    const eye = cam.position;
    for (const s of this.spots) {
      const here = s.room === currentRoom;
      s.marker.visible = !here;
      // signpost floats above the marker
      this.v.set(s.target[0], this.floorZ + 1.15, s.target[1]);
      const dist = Math.hypot(eye.x - s.target[0], eye.z - s.target[1]);
      const p = this.v.clone().project(cam);
      const behind = p.z > 1;
      if (here || behind) { s.el.style.display = 'none'; continue; }
      // only rooms in view get a sign (the plan and arrow pad cover the rest)
      const sx = (p.x * 0.5 + 0.5) * W, sy = Math.min(H - 90, Math.max(60, (-p.y * 0.5 + 0.5) * H));
      if (sx < 60 || sx > W - 60) { s.el.style.display = 'none'; continue; }
      // arrow points from the screen centre towards the room
      const ang = Math.atan2(sy - H * 0.55, sx - W / 2);
      s.el.style.display = '';
      s.el.style.transform = `translate(-50%, -50%) translate(${sx}px, ${sy}px)`;
      s.el.querySelector('.arrow').style.transform = `rotate(${ang}rad)`;
      // rooms behind walls are dimmed (2D segment test against the wall boxes)
      s.el.classList.toggle('far', this.blocked(eye.x, eye.z, s.target[0], s.target[1]));
      s.el.style.zIndex = String(1000 - Math.round(dist * 10));
    }
  }
}

export { nameOf };
export const toWorld = (x, y) => [x - CX, y - CY];
