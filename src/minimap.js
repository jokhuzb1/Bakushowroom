// 2D floor plan drawn from the same plan data, with the visitor's position and view cone.
import { piecesAround } from './geo.js';

let cache = null;

function layout(canvas, unit) {
  const xs = [], zs = [];
  for (const r of unit.rooms) { xs.push(r.rect[0], r.rect[2]); zs.push(r.rect[1], r.rect[3]); }
  const pad = 0.6;
  const x0 = Math.min(...xs) - pad, x1 = Math.max(...xs) + pad, z0 = Math.min(...zs) - pad, z1 = Math.max(...zs) + pad;
  const W = canvas.clientWidth, H = canvas.clientHeight, d = devicePixelRatio;
  canvas.width = W * d; canvas.height = H * d;
  const s = Math.min(W / (x1 - x0), H / (z1 - z0));
  const ox = (W - (x1 - x0) * s) / 2 - x0 * s, oz = (H - (z1 - z0) * s) / 2 - z0 * s;
  return { s, ox, oz, d, W, H };
}

export function drawMinimap(canvas, unit, camera, walk) {
  if (!cache || cache.W !== canvas.clientWidth) cache = layout(canvas, unit);
  const { s, ox, oz, d } = cache;
  const g = canvas.getContext('2d');
  g.setTransform(d, 0, 0, d, 0, 0);
  g.clearRect(0, 0, canvas.width, canvas.height);
  const X = (x) => ox + x * s, Z = (z) => oz + z * s;

  for (const r of unit.rooms) {
    g.fillStyle = r.outdoor ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.16)';
    g.fillRect(X(r.rect[0]), Z(r.rect[1]), (r.rect[2] - r.rect[0]) * s, (r.rect[3] - r.rect[1]) * s);
  }
  for (const w of unit.walls) {
    const horiz = w.a[1] === w.b[1];
    const L = horiz ? w.b[0] - w.a[0] : w.b[1] - w.a[1];
    const e = w.t / 2;
    const rect = (u0, u1, t) => horiz
      ? g.fillRect(X(w.a[0] + u0), Z(w.a[1] - t), (u1 - u0) * s, 2 * t * s)
      : g.fillRect(X(w.a[0] - t), Z(w.a[1] + u0), 2 * t * s, (u1 - u0) * s);
    g.fillStyle = '#f4f1ea';
    for (const p of piecesAround(L + e, 1, w.openings.map((o) => ({ ...o, sill: 0, head: 2 })), -e)) rect(p.u0, p.u1, e);
    g.fillStyle = 'rgba(160,200,230,0.9)';
    for (const o of w.openings) if (o.type === 'window' || o.type === 'slider') rect(o.from, o.to, e * 0.35);
  }
  const yaw = walk.yaw, px = X(walk.pos.x), pz = Z(walk.pos.y);
  const fov = (camera.fov * camera.aspect * Math.PI) / 180 / 2;
  const dir = -Math.PI / 2 - yaw;
  const grad = g.createRadialGradient(px, pz, 0, px, pz, 46);
  grad.addColorStop(0, 'rgba(255,196,120,0.55)');
  grad.addColorStop(1, 'rgba(255,196,120,0)');
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(px, pz);
  g.arc(px, pz, 46, dir - Math.min(fov, 1.1), dir + Math.min(fov, 1.1));
  g.closePath();
  g.fill();
  g.fillStyle = '#ffb259';
  g.beginPath(); g.arc(px, pz, 4.5, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#1a1a1a'; g.lineWidth = 1.5; g.stroke();
}
