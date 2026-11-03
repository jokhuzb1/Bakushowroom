// 360° tour viewer: the path-traced panoramas of a show-flat or shop (see bake.js / render_blender.py),
// with doorway hotspots to the next room, a mini plan with the heading cone, and a room strip.
// Panoramas are equirectangular with u = 0 facing world +x and u = 0.25 facing +z (the bake's camera),
// which an inverted sphere maps one to one, so hotspot directions from the bake land on the doorways.
import * as THREE from 'three';
import './viewer.css';

const DEG = Math.PI / 180;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const wrap180 = (a) => ((((a + 180) % 360) + 360) % 360) - 180;
const small = () => matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 700;

export class PanoViewer {
  constructor(root, { on3D } = {}) {
    this.root = root;
    this.on3D = on3D;
    const $ = (s) => root.querySelector(s);
    this.el = { canvas: $('.pano-canvas'), spots: $('.pano-spots'), title: $('.pano-title b'), sub: $('.pano-title span'), room: $('.pano-room'), plan: $('.pano-plan'), rooms: $('.pano-rooms'), wait: $('.pano-wait') };
    $('.pano-close').onclick = () => this.close();
    $('.pano-3d').onclick = () => { const t = this.tour; this.close(); this.on3D?.(t?.id); };
    this.lon = 0; this.lat = 0; this.fov = 80;
    this.vel = 0; this.anim = null; this.fade = null;
    this.textures = new Map();
    this.dir = new THREE.Vector3();
    this.v = new THREE.Vector3();
    this.bind();
    addEventListener('keydown', (e) => {
      if (this.root.hidden) return;
      if (e.code === 'Escape') this.close();
      else if (e.code === 'ArrowLeft') this.lon -= 6;
      else if (e.code === 'ArrowRight') this.lon += 6;
    });
  }

  init() {
    if (this.renderer) return;
    this.renderer = new THREE.WebGLRenderer({ canvas: this.el.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x14120f);
    this.camera = new THREE.PerspectiveCamera(this.fov, 1, 0.1, 1100);
    const geo = new THREE.SphereGeometry(500, 96, 64);
    geo.scale(-1, 1, 1);
    this.spheres = [0, 1].map(() => {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false }));
      m.visible = false;
      this.scene.add(m);
      return m;
    });
    this.front = 0;
  }

  bind() {
    const c = this.el.canvas;
    let drag = null;
    c.addEventListener('pointerdown', (e) => { c.setPointerCapture(e.pointerId); drag = { x: e.clientX, y: e.clientY, t: performance.now() }; this.vel = 0; this.anim = null; });
    c.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const k = (this.fov / c.clientHeight) * 1.1, dx = e.clientX - drag.x, dy = e.clientY - drag.y, now = performance.now();
      this.lon -= dx * k;
      this.lat = clamp(this.lat + dy * k, -85, 85);
      this.vel = clamp((-dx * k) / Math.max(1, now - drag.t) * 1000 * 0.5, -120, 120);
      drag = { x: e.clientX, y: e.clientY, t: now };
    });
    const up = () => { if (drag && performance.now() - drag.t > 80) this.vel = 0; drag = null; };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('wheel', (e) => { e.preventDefault(); this.fov = clamp(this.fov + e.deltaY * 0.04, 35, 100); }, { passive: false });
  }

  async open(id, stopId = null) {
    this.init();
    this.root.hidden = false;
    document.body.dataset.pano = '1';
    if (this.tour?.id !== id) {
      // another unit: never leave its panorama on screen while this one loads (or if it isn't rendered)
      this.clearImage();
      const res = await fetch(`/pano/${id}/tour.json`);
      if (!res.ok) { this.showWait('This 360° tour has not been rendered yet.'); this.tour = null; return; }
      this.tour = await res.json();
      this.buildUi();
    }
    const t = this.tour;
    this.el.title.textContent = t.title;
    this.el.sub.textContent = t.subtitle;
    const stop = t.stops.find((s) => s.id === stopId) ?? t.stops[0];
    this.go(stop, { look: true });
    if (!this.raf) this.loop();
  }

  close() {
    this.root.hidden = true;
    delete document.body.dataset.pano;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (location.hash.startsWith('#pano=')) history.replaceState(null, '', location.pathname + location.search);
  }

  clearImage() {
    for (const s of this.spheres ?? []) s.visible = false;
    this.fade = null;
  }

  showWait(msg) {
    this.el.wait.hidden = !msg;
    this.el.wait.textContent = msg ?? '';
  }

  buildUi() {
    const t = this.tour;
    this.el.rooms.innerHTML = '';
    for (const s of t.stops) {
      const b = document.createElement('button');
      b.innerHTML = `${s.name}${s.area ? `<small>${s.area.toFixed(1)} m²</small>` : ''}`; // street stops have no area
      b.onclick = () => this.go(s, { look: true });
      s.btn = b;
      this.el.rooms.append(b);
    }
    // plan: fit the bounds into the canvas
    const cv = this.el.plan, W = 220, H = 160, dpr = Math.min(devicePixelRatio, 2);
    cv.width = W * dpr; cv.height = H * dpr;
    const [x0, y0, x1, y1] = t.bounds;
    const k = Math.min((W - 16) / (x1 - x0), (H - 16) / (y1 - y0));
    const ox = (W - (x1 - x0) * k) / 2, oy = (H - (y1 - y0) * k) / 2;
    this.toPx = (x, y) => [ox + (x - x0) * k, oy + (y - y0) * k];
    this.planScale = { k, dpr };
    cv.onclick = (e) => {
      const r = cv.getBoundingClientRect(), px = ((e.clientX - r.left) / r.width) * W, py = ((e.clientY - r.top) / r.height) * H;
      const hit = t.stops.find((s) => s.rects.some((q) => { const [a, b] = this.toPx(q[0], q[1]), [c, d] = this.toPx(q[2], q[3]); return px >= a && px <= c && py >= b && py <= d; }));
      if (hit) this.go(hit, { look: true });
    };
  }

  // move to a stop: crossfade to its panorama; keep the walking direction when arriving through a door
  go(stop, { look = false, heading = null } = {}) {
    const t = this.tour;
    this.stop = stop;
    for (const s of t.stops) s.btn.classList.toggle('on', s === stop);
    this.el.room.innerHTML = `<b>${stop.name}</b>${stop.area ? `<span>${stop.area.toFixed(1)} m²</span>` : ''}`;
    history.replaceState(null, '', `#pano=${t.id}/${stop.id}`);
    const toLon = heading ?? (look ? Math.atan2(stop.look[1], stop.look[0]) / DEG : this.lon);
    this.anim = { from: { lon: this.lon, lat: this.lat }, d: { lon: wrap180(toLon - this.lon), lat: -this.lat }, t0: performance.now(), dur: 650 };
    this.vel = 0;
    this.hotspots(stop);
    const url = `/pano/${t.id}/${stop.id}${small() ? '-2k' : ''}.jpg`;
    const token = (this.token = {});
    const slow = setTimeout(() => { if (token === this.token) this.root.classList.add('loading'); }, 250);
    this.texture(url).finally(() => { clearTimeout(slow); if (token === this.token) this.root.classList.remove('loading'); }).then((tex) => {
      if (token !== this.token) return;
      this.showWait(null);
      const inc = this.spheres[1 - this.front], out = this.spheres[this.front];
      inc.material.map = tex;
      inc.material.opacity = 0;
      inc.material.needsUpdate = true;
      inc.visible = true;
      inc.renderOrder = 1; out.renderOrder = 0;
      this.fade = { inc, out, t0: performance.now(), dur: out.visible ? 450 : 1 };
      this.front = 1 - this.front;
    }).catch(() => {
      if (token !== this.token) return;
      this.clearImage();
      this.showWait(`${stop.name}: the 360° view is still being rendered. Use the 3D view in the meantime.`);
    });
    // warm the cache for the rooms one click away
    for (const l of stop.links) this.texture(`/pano/${t.id}/${l.to}${small() ? '-2k' : ''}.jpg`).catch(() => {});
  }

  texture(url) {
    if (!this.textures.has(url)) {
      this.textures.set(url, new Promise((res, rej) => new THREE.TextureLoader().load(url, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;
        tex.generateMipmaps = false;
        tex.minFilter = THREE.LinearFilter;
        res(tex);
      }, undefined, (e) => { this.textures.delete(url); rej(e); })));
    }
    return this.textures.get(url);
  }

  hotspots(stop) {
    this.el.spots.innerHTML = '';
    this.spots = stop.links.map((l) => {
      const to = this.tour.stops.find((s) => s.id === l.to);
      const el = document.createElement('button');
      el.className = 'pano-spot';
      el.innerHTML = `<i></i><span>${to.name}</span>`;
      el.onclick = () => this.go(to, { heading: Math.atan2(l.dir[2], l.dir[0]) / DEG });
      this.el.spots.append(el);
      return { el, pos: new THREE.Vector3(...l.dir).multiplyScalar(300) };
    });
  }

  loop() {
    this.raf = requestAnimationFrame(() => this.loop());
    const now = performance.now(), dt = Math.min(0.05, (now - (this.last ?? now)) / 1000);
    this.last = now;
    const c = this.el.canvas, w = c.clientWidth, h = c.clientHeight;
    if (w && h && (c.width !== Math.round(w * this.renderer.getPixelRatio()) || c.height !== Math.round(h * this.renderer.getPixelRatio()))) {
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
    }
    if (this.anim) {
      const a = this.anim, k = clamp((now - a.t0) / a.dur, 0, 1), e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      this.lon = a.from.lon + a.d.lon * e;
      this.lat = a.from.lat + a.d.lat * e;
      if (k >= 1) this.anim = null;
    } else if (Math.abs(this.vel) > 0.05) {
      this.lon += this.vel * dt;
      this.vel *= Math.exp(-dt * 4);
    }
    if (this.fade) {
      const f = this.fade, k = clamp((now - f.t0) / f.dur, 0, 1);
      f.inc.material.opacity = k;
      if (k >= 1) { f.out.visible = false; f.inc.material.opacity = 1; this.fade = null; }
    }
    this.camera.fov = this.fov;
    this.camera.updateProjectionMatrix();
    const phi = this.lon * DEG, th = this.lat * DEG;
    this.dir.set(Math.cos(th) * Math.cos(phi), Math.sin(th), Math.cos(th) * Math.sin(phi));
    this.camera.lookAt(this.dir);
    this.camera.updateMatrixWorld();
    this.renderer.render(this.scene, this.camera);
    for (const s of this.spots ?? []) {
      this.v.copy(s.pos).project(this.camera);
      const facing = s.pos.dot(this.dir) > 0;
      const vis = facing && Math.abs(this.v.x) < 1.05 && Math.abs(this.v.y) < 1.05;
      s.el.classList.toggle('hidden', !vis);
      if (vis) s.el.style.transform = `translate(${((this.v.x + 1) / 2) * w}px, ${((1 - this.v.y) / 2) * h}px) translate(-50%, -50%)`;
    }
    this.drawPlan();
  }

  drawPlan() {
    const t = this.tour;
    if (!t || !this.toPx) return;
    const cv = this.el.plan, g = cv.getContext('2d'), { k, dpr } = this.planScale;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, cv.width, cv.height);
    for (const s of t.stops) {
      g.fillStyle = s === this.stop ? 'rgba(255, 178, 89, 0.55)' : 'rgba(250, 247, 241, 0.16)';
      for (const q of s.rects) { const [a, b] = this.toPx(q[0], q[1]); g.fillRect(a, b, (q[2] - q[0]) * k, (q[3] - q[1]) * k); }
    }
    g.fillStyle = 'rgba(250, 247, 241, 0.85)';
    for (const q of t.walls) { const [a, b] = this.toPx(q[0], q[1]); g.fillRect(a, b, Math.max(1, (q[2] - q[0]) * k), Math.max(1, (q[3] - q[1]) * k)); }
    // heading cone at the camera of this stop
    const [px, py] = this.toPx(...this.stop.plan), a = this.lon * DEG, half = (this.camera.fov * this.camera.aspect * DEG) / 2;
    const r = 34;
    const grad = g.createRadialGradient(px, py, 2, px, py, r);
    grad.addColorStop(0, 'rgba(255, 178, 89, 0.8)');
    grad.addColorStop(1, 'rgba(255, 178, 89, 0)');
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(px, py);
    g.arc(px, py, r, a - Math.min(half, 1.2), a + Math.min(half, 1.2));
    g.closePath();
    g.fill();
    g.fillStyle = '#ffb259';
    g.beginPath(); g.arc(px, py, 4, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.stroke();
  }
}
