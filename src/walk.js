// First-person walkthrough: drag to look, WASD / arrows to move, click the floor to walk there.
import * as THREE from 'three';

export class Walk {
  constructor(camera, dom, colliders, floors) {
    this.camera = camera;
    this.dom = dom;
    this.colliders = colliders;
    this.floors = floors;
    this.enabled = false;
    this.pos = new THREE.Vector2();
    this.yaw = 0;
    this.pitch = 0;
    this.eye = 1.6;
    this.radius = 0.22;
    this.keys = new Set();
    this.vel = new THREE.Vector2(); // smoothed walking velocity (m/s)
    this.target = null;
    this.ray = new THREE.Raycaster();
    // Framing: the camera sits `pullback` metres behind the standing spot and everything closer than
    // the near plane (the wall behind you, the room next door) is cut away - a section view at eye level.
    // `nearFn(fx, fz)` can set the cut per view direction (used to circle a room from outside).
    this.pullback = 0;
    this.nearFn = null;
    this.baseNear = camera.near;

    let down = null, last = null;
    dom.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      down = last = [e.clientX, e.clientY];
      dom.setPointerCapture(e.pointerId);
    });
    dom.addEventListener('pointermove', (e) => {
      if (!this.enabled || !last) return;
      const dx = e.clientX - last[0], dy = e.clientY - last[1];
      last = [e.clientX, e.clientY];
      this.yaw -= dx * 0.0042;
      this.pitch = THREE.MathUtils.clamp(this.pitch - dy * 0.0042, -1.2, 1.2);
      this.target = null;
    });
    dom.addEventListener('pointerup', (e) => {
      if (!this.enabled || !down) return;
      const moved = Math.hypot(e.clientX - down[0], e.clientY - down[1]);
      down = last = null;
      if (moved < 5) this.clickTo(e);
    });
    dom.addEventListener('wheel', (e) => {
      if (!this.enabled) return;
      this.camera.fov = THREE.MathUtils.clamp(this.camera.fov + e.deltaY * 0.02, 40, 85);
      this.camera.updateProjectionMatrix();
    }, { passive: true });
    addEventListener('keydown', (e) => { if (this.enabled) this.keys.add(e.code); });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
  }

  clickTo(e) {
    const r = this.dom.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(ndc, this.camera);
    this.ray.near = this.camera.near; // ignore cut-away geometry in front of the near plane
    const hit = this.ray.intersectObjects(this.floors, true).find((h) => h.face && h.face.normal.y > 0.9);
    this.ray.near = 0;
    if (hit) { this.unframe(); this.target = new THREE.Vector2(hit.point.x, hit.point.z); }
  }

  place(x, z, yaw, pitch = -0.05) {
    this.pos.set(x, z);
    this.yaw = yaw;
    this.pitch = pitch;
    this.target = null;
    this.apply();
  }

  // camera pose for a given walk state, used for animated transitions
  poseFor(x, z, yaw, pitch, pull = 0) {
    const p = new THREE.Vector3(x + Math.sin(yaw) * pull, this.eye, z + Math.cos(yaw) * pull);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
    return { p, q };
  }

  nearFor(pull) { return pull > 0 ? Math.max(this.baseNear, pull - 0.2) : this.baseNear; }

  frame(pull, nearFn = null) {
    this.pullback = pull;
    this.nearFn = nearFn;
    this.setNear(nearFn ? nearFn(-Math.sin(this.yaw), -Math.cos(this.yaw)) : this.nearFor(pull));
  }

  unframe() { if (this.pullback || this.nearFn) this.frame(0); }

  setNear(n) {
    n = Math.max(this.baseNear, n);
    if (Math.abs(this.camera.near - n) > 1e-3) { this.camera.near = n; this.camera.updateProjectionMatrix(); }
  }

  apply() {
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    this.camera.position.set(this.pos.x + s * this.pullback, this.eye, this.pos.y + c * this.pullback);
    this.camera.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
    if (this.nearFn) this.setNear(this.nearFn(-s, -c));
  }

  collide() {
    const r = this.radius;
    for (let it = 0; it < 3; it++) {
      for (const c of this.colliders) {
        const cx = THREE.MathUtils.clamp(this.pos.x, c.x0, c.x1), cz = THREE.MathUtils.clamp(this.pos.y, c.z0, c.z1);
        const dx = this.pos.x - cx, dz = this.pos.y - cz, d2 = dx * dx + dz * dz;
        if (d2 < r * r) {
          if (d2 > 1e-10) {
            const d = Math.sqrt(d2);
            this.pos.x += (dx / d) * (r - d);
            this.pos.y += (dz / d) * (r - d);
          } else {
            // center inside the box: push out along the shallowest axis
            const pushes = [[c.x0 - r - this.pos.x, 0], [c.x1 + r - this.pos.x, 0], [0, c.z0 - r - this.pos.y], [0, c.z1 + r - this.pos.y]];
            pushes.sort((a, b) => Math.abs(a[0] + a[1]) - Math.abs(b[0] + b[1]));
            this.pos.x += pushes[0][0]; this.pos.y += pushes[0][1];
          }
        }
      }
    }
  }

  update(dt) {
    if (!this.enabled) return;
    const k = this.keys;
    const f = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const s = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    const turn = (k.has('ArrowLeft') ? 1 : 0) - (k.has('ArrowRight') ? 1 : 0);
    this.yaw += turn * dt * 1.6;
    const speed = (k.has('ShiftLeft') || k.has('ShiftRight') ? 2.6 : 1.5) * dt;
    const fwd = new THREE.Vector2(-Math.sin(this.yaw), -Math.cos(this.yaw));
    const right = new THREE.Vector2(Math.cos(this.yaw), -Math.sin(this.yaw));
    // damped movement: velocity eases towards the key direction and coasts to a stop
    const want = f || s ? fwd.clone().multiplyScalar(f).add(right.clone().multiplyScalar(s)).normalize().multiplyScalar(speed / Math.max(dt, 1e-4)) : new THREE.Vector2();
    this.vel.lerp(want, 1 - Math.exp(-dt * 8));
    if (f || s) { this.target = null; this.unframe(); }
    if (this.vel.lengthSq() > 1e-4 && !this.target) {
      this.pos.add(this.vel.clone().multiplyScalar(dt));
    } else if (this.target) {
      const d = this.target.clone().sub(this.pos);
      const len = d.length();
      if (len < 0.05) this.target = null;
      else {
        const step = Math.min(len, Math.max(0.4, Math.min(len * 3, 2.2)) * dt);
        const before = this.pos.clone();
        this.pos.add(d.multiplyScalar(step / len));
        this.collide();
        if (this.pos.distanceTo(before) < step * 0.2) this.target = null; // blocked
      }
    }
    this.collide();
    this.apply();
  }
}
