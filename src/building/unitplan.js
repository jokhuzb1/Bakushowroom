// 2D floor plan of the apartment being walked through: rooms with names and areas, the visitor's
// position and view cone, and click-to-go (on the plan or via room shortcuts).
import { CX, CY } from './model.js';

const ROOM_STYLE = {
  living: { name: 'Living & kitchen', fill: '#efe0c8' },
  bedroom: { name: 'Bedroom', fill: '#e2e6ee' },
  kids: { name: "Children's room", fill: '#e5eedf' },
  bath: { name: 'Bathroom', fill: '#d6e7ee' },
  hall: { name: 'Hall', fill: '#e9e5de' },
  balcony: { name: 'Balcony', fill: '#ece7dc' },
};
const styleOf = (r) => ROOM_STYLE[r.kids ? 'kids' : r.type] ?? ROOM_STYLE.hall;
const inRect = (q, x, y) => x >= q[0] && x <= q[2] && y >= q[1] && y <= q[3];

export class UnitPlan {
  constructor(root, onGo) {
    this.root = root;
    this.canvas = root.querySelector('canvas');
    this.list = root.querySelector('.rooms');
    this.title = root.querySelector('.title');
    this.onGo = onGo;
    this.canvas.addEventListener('click', (e) => {
      if (!this.data) return;
      const r = this.canvas.getBoundingClientRect();
      const [x, y] = this.toPlan(e.clientX - r.left, e.clientY - r.top);
      const room = this.roomAt(x, y);
      if (room) this.onGo(room, x, y);
    });
    this.canvas.addEventListener('mousemove', (e) => {
      if (!this.data) return;
      const r = this.canvas.getBoundingClientRect();
      const [x, y] = this.toPlan(e.clientX - r.left, e.clientY - r.top);
      const room = this.roomAt(x, y);
      this.hover = room;
      this.canvas.style.cursor = room ? 'pointer' : 'default';
    });
    this.canvas.addEventListener('mouseleave', () => { this.hover = null; });
    // tap the title to fold the plan away (folded by default on small screens)
    this.title.addEventListener('click', () => root.classList.toggle('min'));
    if (innerWidth < 720) root.classList.add('min');
  }

  roomAt(x, y) {
    return this.data.rooms.find((r) => r.rects.some((q) => inRect(q, x, y))) ?? null;
  }

  open({ unit, rooms, walls, furniture = [] }) {
    // bounds: the flat's own outline plus its balconies
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const q of [...unit.rects, ...rooms.map((r) => r.bbox)]) {
      x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[2]); y1 = Math.max(y1, q[3]);
    }
    const pad = 0.35;
    this.bounds = [x0 - pad, y0 - pad, x1 + pad, y1 + pad];
    this.data = {
      unit,
      rooms,
      furniture: furniture.map((c) => [c.x0 + CX, c.z0 + CY, c.x1 + CX, c.z1 + CY]).filter((q) => rooms.some((r) => r.rects.some((p) => q[0] < p[2] && q[2] > p[0] && q[1] < p[3] && q[3] > p[1]))),
      walls: walls.filter((w) => w[2] > this.bounds[0] && w[0] < this.bounds[2] && w[3] > this.bounds[1] && w[1] < this.bounds[3]),
    };
    this.title.innerHTML = `<b>Apartment ${unit.code}</b><span class="fold"></span><span>${unit.rooms ?? ''}${unit.rooms ? '-room · ' : ''}${unit.area?.toFixed(1) ?? ''} m²</span>`;
    // room shortcuts, living first
    const order = { living: 0, bedroom: 1, hall: 3, bath: 4, balcony: 5 };
    this.list.innerHTML = '';
    const named = {};
    for (const r of [...rooms].sort((a, b) => (order[a.type] ?? 9) - (order[b.type] ?? 9) || b.area - a.area)) {
      const st = styleOf(r);
      named[st.name] = (named[st.name] ?? 0) + 1;
      const b = document.createElement('button');
      b.innerHTML = `<i style="background:${st.fill}"></i>${st.name}${named[st.name] > 1 ? ` ${named[st.name]}` : ''}<small>${r.area.toFixed(1)}</small>`;
      b.room = r;
      b.onclick = () => this.onGo(r);
      this.list.append(b);
    }
    this.root.hidden = false;
    this.layout();
  }

  close() {
    this.root.hidden = true;
    this.data = null;
  }

  layout() {
    const c = this.canvas, d = devicePixelRatio;
    const W = c.clientWidth, H = c.clientHeight;
    c.width = W * d; c.height = H * d;
    const [x0, y0, x1, y1] = this.bounds;
    const s = Math.min(W / (x1 - x0), H / (y1 - y0));
    this.view = { s, ox: (W - (x1 - x0) * s) / 2 - x0 * s, oy: (H - (y1 - y0) * s) / 2 - y0 * s, d, W, H };
  }
  toCanvas(x, y) { return [this.view.ox + x * this.view.s, this.view.oy + y * this.view.s]; }
  toPlan(px, py) { return [(px - this.view.ox) / this.view.s, (py - this.view.oy) / this.view.s]; }

  draw(camera, walk) {
    if (!this.data) return;
    if (this.canvas.clientWidth !== this.view.W) this.layout();
    const g = this.canvas.getContext('2d');
    const { s, d } = this.view;
    g.setTransform(d, 0, 0, d, 0, 0);
    g.clearRect(0, 0, this.view.W, this.view.H);
    const R = (q, e = 0) => { const [a, b] = this.toCanvas(q[0] - e, q[1] - e); return [a, b, (q[2] - q[0] + 2 * e) * s, (q[3] - q[1] + 2 * e) * s]; };

    const pos = [walk.pos.x + CX, walk.pos.y + CY];
    const here = this.roomAt(pos[0], pos[1]);
    for (const r of this.data.rooms) {
      const st = styleOf(r);
      g.fillStyle = st.fill;
      for (const q of r.rects) g.fillRect(...R(q, 0.14)); // slight overlap closes cracks between strips
      if (r === this.hover || r === here) {
        g.fillStyle = r === here ? 'rgba(255,178,89,0.28)' : 'rgba(255,178,89,0.18)';
        for (const q of r.rects) g.fillRect(...R(q, 0.14));
      }
    }
    // furniture footprints
    g.fillStyle = 'rgba(120, 104, 84, 0.22)';
    g.strokeStyle = 'rgba(90, 76, 60, 0.45)';
    g.lineWidth = 1;
    for (const q of this.data.furniture) {
      const [a, b, w, h] = R(q);
      g.beginPath();
      g.roundRect(a + 1, b + 1, Math.max(2, w - 2), Math.max(2, h - 2), 3);
      g.fill();
      g.stroke();
    }
    g.fillStyle = '#2e2b27';
    for (const w of this.data.walls) g.fillRect(...R(w));

    // labels at the room's layout centre
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const r of this.data.rooms) {
      const q = r.inner ?? r.bbox;
      const [cx, cy] = this.toCanvas((q[0] + q[2]) / 2, (q[1] + q[3]) / 2);
      const w = (q[2] - q[0]) * s, h = (q[3] - q[1]) * s;
      if (Math.min(w, h) < 18) continue;
      const st = styleOf(r);
      const small = Math.min(w, h) < 46 || w < 70;
      g.fillStyle = '#2a2723';
      g.font = `600 ${small ? 9 : 11}px Inter, "Segoe UI", system-ui, sans-serif`;
      const name = small ? st.name.split(' ')[0] : st.name;
      g.fillText(name, cx, cy - (small ? 5 : 7));
      g.fillStyle = '#6d675e';
      g.font = `${small ? 9 : 10}px Inter, "Segoe UI", system-ui, sans-serif`;
      g.fillText(`${r.area.toFixed(1)} m²`, cx, cy + (small ? 6 : 8));
    }

    // visitor and view cone
    const [px, py] = this.toCanvas(pos[0], pos[1]);
    const dir = Math.atan2(-Math.cos(walk.yaw), -Math.sin(walk.yaw));
    const fov = Math.min(1.0, (camera.fov * camera.aspect * Math.PI) / 360);
    const grad = g.createRadialGradient(px, py, 0, px, py, 58);
    grad.addColorStop(0, 'rgba(255,160,60,0.55)');
    grad.addColorStop(1, 'rgba(255,160,60,0)');
    g.fillStyle = grad;
    g.beginPath(); g.moveTo(px, py); g.arc(px, py, 58, dir - fov, dir + fov); g.closePath(); g.fill();
    g.fillStyle = '#ff9a3c';
    g.beginPath(); g.arc(px, py, 6, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke();

    // target marker while gliding
    if (this.target) {
      const [tx, ty] = this.toCanvas(this.target[0], this.target[1]);
      g.strokeStyle = '#ff9a3c'; g.lineWidth = 2;
      g.beginPath(); g.arc(tx, ty, 8, 0, Math.PI * 2); g.stroke();
    }
    // highlight the shortcut of the room you are in
    for (const b of this.list.children) b.classList.toggle('on', b.room === here);
  }
}
