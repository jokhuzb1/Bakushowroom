// Low-detail surroundings (neighbouring blocks, street trees) so the windows look out onto a city, not a void.
import * as THREE from 'three';
import { rand } from './textures.js';

function facadeTexture(base, glass, seed) {
  const S = 256, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const R = rand(seed);
  g.fillStyle = base;
  g.fillRect(0, 0, S, S);
  // 2 floors x 2 bays per tile
  for (let fy = 0; fy < 2; fy++) for (let bx = 0; bx < 2; bx++) {
    const x = bx * 128, y = fy * 128;
    const lit = R();
    g.fillStyle = lit > 0.85 ? '#d9c6a0' : glass;
    g.fillRect(x + 18, y + 26, 92, 78);
    g.fillStyle = 'rgba(255,255,255,0.08)';
    g.fillRect(x + 18, y + 26, 92, 6);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// box UVs where one texture repeat = 7m wide x 6.4m tall (two bays, two floors)
function facadeBox(w, h, d) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    const u = ax > 0.5 ? p.getZ(i) : p.getX(i);
    if (ay > 0.5) uv.setXY(i, 0.02, 0.02);
    else uv.setXY(i, u / 7, (p.getY(i) + h / 2) / 6.4);
  }
  return geo;
}

export function buildContext(unit, center) {
  const root = new THREE.Group();
  const gy = -unit.floorElevation;
  const R = rand(2024);
  const mats = [
    ['#d6cfc2', '#4c5761'], ['#bdb5a8', '#3d4852'], ['#e6e3dc', '#56636e'], ['#9e978c', '#36414a'], ['#cbbfae', '#475360'],
  ].map(([b, gl], i) => new THREE.MeshStandardMaterial({ map: facadeTexture(b, gl, 7 + i), roughness: 0.75 }));

  let placed = 0, tries = 0;
  while (placed < 120 && tries++ < 2000) {
    const a = R() * Math.PI * 2, r = 45 + Math.pow(R(), 0.7) * 230;
    const x = center.x + Math.cos(a) * r, z = center.y + Math.sin(a) * r;
    // keep a park open in front of the main living windows (north, -z)
    if (z < center.y - 20 && Math.abs(x - center.x) < 70 && r < 140) continue;
    const w = 14 + R() * 26, d = 12 + R() * 22, floors = 3 + Math.floor(R() * (r < 90 ? 6 : 14));
    const h = floors * 3.2;
    // single material per mesh (roof faces sample a solid corner of the facade texture)
    const m = new THREE.Mesh(facadeBox(w, h, d), mats[placed % mats.length]);
    m.position.set(x, gy + h / 2, z);
    m.rotation.y = Math.round(R() * 4) * (Math.PI / 2) + (R() - 0.5) * 0.08;
    root.add(m);
    placed++;
  }

  // street trees and the park
  const leaf = new THREE.MeshStandardMaterial({ color: 0x4d6b3a, roughness: 0.9, flatShading: true });
  const leaf2 = new THREE.MeshStandardMaterial({ color: 0x3c5a30, roughness: 0.9, flatShading: true });
  const trunk = new THREE.MeshStandardMaterial({ color: 0x4a3b2e, roughness: 1 });
  const crown = new THREE.IcosahedronGeometry(1, 1);
  const stem = new THREE.CylinderGeometry(0.18, 0.25, 1, 6);
  for (let i = 0; i < 110; i++) {
    const park = i < 60;
    const x = park ? center.x + (R() - 0.5) * 120 : center.x + (R() - 0.5) * 300;
    const z = park ? center.y - 25 - R() * 100 : center.y + (R() - 0.5) * 300;
    if (!park && Math.hypot(x - center.x, z - center.y) < 30) continue;
    const s = 3 + R() * 3, th = 2 + R() * 2;
    const t = new THREE.Mesh(stem, trunk);
    t.scale.set(1, th, 1);
    t.position.set(x, gy + th / 2, z);
    const c = new THREE.Mesh(crown, R() > 0.5 ? leaf : leaf2);
    c.scale.set(s, s * (0.9 + R() * 0.4), s);
    c.position.set(x, gy + th + s * 0.7, z);
    root.add(t, c);
  }
  // park lawn and paths
  const lawn = new THREE.Mesh(new THREE.PlaneGeometry(140, 120).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x5f7a45, roughness: 1 }));
  lawn.position.set(center.x, gy + 0.02, center.y - 80);
  root.add(lawn);
  root.traverse((o) => { if (o.isMesh) o.receiveShadow = false; });
  return root;
}
