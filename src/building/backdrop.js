// 360° view backdrop: a large open cylinder around the site carrying a skyline panorama. Uses a real
// photo when one is placed at public/views/panorama.jpg (equirectangular strip, horizon at the bottom
// third, full 360° across), otherwise paints a procedural city skyline.
import * as THREE from 'three';
import { rand } from '../textures.js';

const R = 700, H = 230;

function skylineTexture(seed = 7) {
  const W = 4096, Hh = 768, c = document.createElement('canvas');
  c.width = W; c.height = Hh;
  const g = c.getContext('2d');
  const rnd = rand(seed);
  const base = Hh - 70; // horizon line
  const lerp = (a, b, t) => a + (b - a) * t;
  const mix = (c1, c2, t) => `rgb(${c1.map((v, i) => Math.round(lerp(v, c2[i], t))).join(',')})`;
  const haze = [205, 214, 222];
  // three layers, far to near: further = lighter, bluer, flatter
  const layers = [
    { n: 260, h: [30, 150], w: [18, 60], col: [150, 160, 172], fade: 0.72, win: 0 },
    { n: 170, h: [40, 210], w: [24, 80], col: [168, 156, 138], fade: 0.5, win: 0.25 },
    { n: 110, h: [50, 260], w: [40, 120], col: [196, 180, 154], fade: 0.3, win: 0.55 },
  ];
  for (const L of layers) {
    for (let i = 0; i < L.n; i++) {
      const w = lerp(L.w[0], L.w[1], rnd()), h = lerp(L.h[0], L.h[1], rnd() ** 1.6);
      const x = rnd() * W, y = base - h;
      const tone = 0.85 + rnd() * 0.25;
      const glass = rnd() < 0.12;
      const col = glass ? [118, 138, 156] : L.col.map((v) => Math.min(255, v * tone));
      g.fillStyle = mix(col, haze, L.fade);
      const draw = (xx) => {
        g.fillRect(xx, y, w, h + 4);
        // tower crowns on some of the tall ones
        if (h > 170 && rnd() < 0.5) g.fillRect(xx + w * 0.3, y - h * 0.08, w * 0.4, h * 0.08);
        if (L.win > 0) {
          g.fillStyle = mix(glass ? [70, 90, 110] : [92, 96, 104], haze, L.fade + 0.1);
          for (let wy = y + 6; wy < base - 4; wy += 9) {
            for (let wx = xx + 4; wx < xx + w - 4; wx += 7) if (rnd() < L.win) g.fillRect(wx, wy, 3, 4);
          }
          g.fillStyle = mix(col, haze, L.fade);
        }
      };
      draw(x);
      if (x + w > W) draw(x - W); // wrap seamlessly
    }
  }
  // haze over the lower part, ground band below the horizon
  const hz = g.createLinearGradient(0, base - 160, 0, base);
  hz.addColorStop(0, 'rgba(210,218,226,0)');
  hz.addColorStop(1, 'rgba(210,218,226,0.55)');
  g.fillStyle = hz;
  g.fillRect(0, base - 160, W, 160);
  const gr = g.createLinearGradient(0, base, 0, Hh);
  gr.addColorStop(0, 'rgb(176,178,170)');
  gr.addColorStop(1, 'rgb(128,134,118)');
  g.fillStyle = gr;
  g.fillRect(0, base, W, Hh - base);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

export function buildBackdrop(center = new THREE.Vector3(23, 0, 40)) {
  const mat = new THREE.MeshBasicMaterial({ map: skylineTexture(), transparent: true, side: THREE.BackSide, depthWrite: false, fog: false });
  const cyl = new THREE.Mesh(new THREE.CylinderGeometry(R, R, H, 160, 1, true), mat);
  cyl.position.set(center.x, H / 2 - 18, center.z);
  cyl.renderOrder = -1;
  cyl.name = 'backdrop';
  // a real panorama, if one has been provided, replaces the painted skyline
  new THREE.TextureLoader().load('/views/panorama.jpg', (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    mat.map.dispose();
    mat.map = tex;
    mat.transparent = false;
    mat.needsUpdate = true;
  }, undefined, () => {});
  // ground disc reaching the backdrop so there is no visible edge
  const ground = new THREE.Mesh(new THREE.CircleGeometry(R + 5, 96).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x8c8f80 }));
  ground.position.set(center.x, -0.2, center.z);
  const g = new THREE.Group();
  g.add(cyl, ground);
  return g;
}
