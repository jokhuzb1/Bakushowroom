// "Warm Minimal" design package: light oak, cream and taupe living spaces (reference: warm minimal
// living room) with a light-grey Scandinavian kitchen (reference: grey flat fronts, black handles,
// oak shelf). Other packages (Japandi, Luxe) can follow the same shape: palette() + piece builders.
import * as THREE from 'three';
import { box, cyl, mesh } from '../geo.js';
import { pillowGeo } from '../furniture.js';

export const name = 'Warm Minimal';

// Recolours the material kit in place.
export function palette(M) {
  const std = (p) => new THREE.MeshStandardMaterial(p);
  const tint = (m, color, extra = {}) => { const c = m.clone(); c.color.set(color); Object.assign(c, extra); return c; };
  M.oak = tint(M.oak, 0xf6efe4);
  M.sofaFabric = tint(M.sofaFabric, 0xe6dfd4);
  M.linenWhite = tint(M.linenWhite, 0xf1ece4);
  M.linenSand = tint(M.linenSand, 0xb8ab9a);
  M.throwRust = tint(M.throwRust, 0x45413d); // charcoal throw, as on the ottoman in the reference
  M.headboard = tint(M.headboard, 0xc9c0b4);
  M.fabricWall = tint(M.fabricWall, 0xcfc6b9);
  M.curtain = tint(M.curtain, 0xa49786);
  M.rug = tint(M.rug, 0xb3a99c);
  M.chairFabric = tint(M.chairFabric, 0xd8d0c4);
  M.sheer = std({ color: 0xf7f4ee, roughness: 1, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false });
  M.ottoman = tint(M.sofaFabric, 0xcfc6ba);
  M.darkWood = tint(M.walnut, 0x4a3b30, { roughness: 0.5 });
  M.stoneTop = std({ color: 0xdcd3c6, roughness: 0.6 });
  M.blackCeramic = std({ color: 0x1d1c1b, roughness: 0.55 });
  // kitchen
  M.kitchenGrey = std({ color: 0xbcbebd, roughness: 0.62 });
  M.quartz = std({ color: 0xa3a4a2, roughness: 0.38 });
  M.ovenGlass = std({ color: 0x0c0c0d, roughness: 0.07, metalness: 0.2 });
  M.bentwood = std({ color: 0x161514, roughness: 0.42 });
  for (const k of Object.keys(M)) if (M[k]?.isMaterial && k !== 'mirror' && !M[k].isLineBasicMaterial) M[k].envMapIntensity = 1;
  return M;
}

// Upholstered ottoman with a charcoal throw draped over one end.
export function ottoman(M, w = 1.1, d = 0.6) {
  const g = new THREE.Group();
  g.add(box(w - 0.12, 0.06, d - 0.12, M.blackMetal, 0, 0.03, 0));
  const top = mesh(pillowGeo(w, 0.36, d, 0.12, 6), M.ottoman);
  top.position.y = 0.24;
  g.add(top);
  const tw = 0.42;
  g.add(box(tw, 0.012, d + 0.04, M.throwRust, w / 2 - tw / 2 - 0.05, 0.425, 0, { r: 0.005 }));
  for (const s of [-1, 1]) g.add(box(tw, 0.24, 0.012, M.throwRust, w / 2 - tw / 2 - 0.05, 0.31, s * (d / 2 + 0.02), { r: 0.005 }));
  return g;
}

// Low dark-wood oval coffee table on a slab pedestal, with a black bowl.
export function coffeeTable(M) {
  const g = new THREE.Group();
  const top = mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.04, 48), M.darkWood);
  top.scale.set(1, 1, 0.62);
  top.position.y = 0.37;
  g.add(top);
  g.add(box(0.5, 0.33, 0.06, M.darkWood, 0, 0.175, 0, { r: 0.01 }));
  g.add(box(0.06, 0.33, 0.3, M.darkWood, 0, 0.175, 0, { r: 0.01 }));
  const bowl = mesh(new THREE.SphereGeometry(0.13, 28, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), M.blackCeramic, { uv: false });
  bowl.scale.set(1, 0.45, 1);
  bowl.position.set(0.12, 0.45, 0.02);
  bowl.rotation.x = Math.PI;
  g.add(bowl);
  g.add(box(0.24, 0.03, 0.17, M.linenSand, -0.2, 0.405, 0.04, { r: 0.004 }));
  return g;
}

// Chandigarh-style lounge chair: dark wood V-legs, cream cushions, wooden arms.
export function loungeChair(M) {
  const g = new THREE.Group();
  for (const sx of [-1, 1]) {
    const x = sx * 0.3;
    for (const [z, r] of [[0.12, 0.32], [-0.12, -0.32]]) {
      const leg = box(0.045, 0.62, 0.045, M.darkWood, x, 0.31, z);
      leg.rotation.x = r;
      g.add(leg);
    }
    g.add(box(0.06, 0.035, 0.66, M.darkWood, x, 0.6, 0.02, { r: 0.008 }));
    const back = box(0.045, 0.5, 0.045, M.darkWood, x, 0.68, -0.27);
    back.rotation.x = -0.28;
    g.add(back);
  }
  g.add(box(0.6, 0.04, 0.5, M.darkWood, 0, 0.38, 0.02));
  const seat = mesh(pillowGeo(0.58, 0.1, 0.52, 0.3, 6), M.chairFabric);
  seat.position.set(0, 0.45, 0.04);
  g.add(seat);
  const back = mesh(pillowGeo(0.56, 0.08, 0.44, 0.3, 6), M.chairFabric);
  back.position.set(0, 0.72, -0.24);
  back.rotation.x = -Math.PI / 2 - 0.28;
  g.add(back);
  return g;
}

// Floating oak media console with a stone top, black vase and books (TV and slatted wall are added by the layout).
export function mediaConsole(M, w) {
  const g = new THREE.Group();
  g.add(box(w, 0.3, 0.4, M.oakVeneer, 0, 0.4, 0, { r: 0.004 }));
  g.add(box(w + 0.02, 0.025, 0.42, M.stoneTop, 0, 0.5625, 0));
  g.add(box(w - 0.04, 0.004, 0.004, M.darkWood, 0, 0.4, 0.201));
  const pts = [[0, 0], [0.07, 0], [0.11, 0.06], [0.12, 0.15], [0.09, 0.25], [0.04, 0.3], [0.035, 0.34], [0, 0.34]].map(([r, y]) => new THREE.Vector2(r, y));
  const vase = mesh(new THREE.LatheGeometry(pts, 28), M.blackCeramic, { uv: false });
  vase.position.set(w * 0.34, 0.575, 0.02);
  g.add(vase);
  for (const [i, c] of [[0, M.linenSand], [1, M.darkWood], [2, M.stoneTop]]) g.add(box(0.26 - i * 0.03, 0.03, 0.19, c, -w * 0.32, 0.59 + i * 0.03, 0.03, { r: 0.004 }));
  return g;
}

// Kitchen run after the reference: flat light-grey fronts with slim black bars and knobs, thin grey
// worktop, low upstand, an oak floating shelf instead of wall cabinets, black swing-arm lamp, black oven.
export function kitchenRun(M, len, { sink, cooktop } = {}) {
  const g = new THREE.Group();
  g.add(box(len, 0.1, 0.5, M.blackMetal, 0, 0.05, -0.05));
  g.add(box(len, 0.78, 0.58, M.kitchenGrey, 0, 0.49, -0.01));
  const n = Math.max(1, Math.round(len / 0.6)), dw = len / n;
  for (let i = 0; i < n; i++) {
    const x = -len / 2 + dw * (i + 0.5);
    const oven = cooktop !== undefined && Math.abs(x - cooktop) < dw / 2;
    if (oven) {
      g.add(box(dw - 0.006, 0.56, 0.02, M.ovenGlass, x, 0.42, 0.29));
      g.add(box(dw - 0.1, 0.012, 0.02, M.steel, x, 0.66, 0.31, { r: 0.005 }));
      g.add(box(dw - 0.006, 0.17, 0.02, M.kitchenGrey, x, 0.79, 0.29));
      g.add(box(0.18, 0.01, 0.012, M.blackMetal, x, 0.8, 0.306, { r: 0.004 }));
    } else if (i % 2 === 0) {
      // drawer stack with bar handles
      for (const [y, h] of [[0.27, 0.36], [0.62, 0.32]]) {
        g.add(box(dw - 0.006, h - 0.006, 0.02, M.kitchenGrey, x, y, 0.29));
        g.add(box(0.18, 0.01, 0.012, M.blackMetal, x, y + h / 2 - 0.06, 0.306, { r: 0.004 }));
      }
    } else {
      // door with a black knob
      g.add(box(dw - 0.006, 0.76, 0.02, M.kitchenGrey, x, 0.49, 0.29));
      g.add(cyl(0.012, 0.012, 0.02, M.blackMetal, x + dw / 2 - 0.06, 0.8, 0.31, 12).rotateX(Math.PI / 2));
    }
  }
  g.add(box(len, 0.022, 0.62, M.quartz, 0, 0.891, 0.005));
  g.add(box(len, 0.16, 0.015, M.quartz, 0, 0.98, -0.2925));
  // oak floating shelf with bowls and a small vase
  g.add(box(Math.min(len, 1.6), 0.035, 0.24, M.oakVeneer, -len / 2 + Math.min(len, 1.6) / 2, 1.5, -0.18, { r: 0.004 }));
  for (const [dx, r, h] of [[0.25, 0.09, 0.05], [0.45, 0.07, 0.06], [0.75, 0.05, 0.12]]) g.add(cyl(r, r * 0.75, h, M.blackCeramic, -len / 2 + dx, 1.517 + h / 2, -0.18, 20));
  // swing-arm wall lamp
  const lx = -len / 2 + Math.min(len, 1.6) + 0.15;
  g.add(cyl(0.035, 0.035, 0.02, M.blackMetal, lx, 1.75, -0.285, 16).rotateX(Math.PI / 2));
  g.add(box(0.012, 0.012, 0.32, M.blackMetal, lx, 1.75, -0.13));
  g.add(box(0.012, 0.18, 0.012, M.blackMetal, lx, 1.66, 0.03));
  const shade = mesh(new THREE.ConeGeometry(0.085, 0.14, 24, 1, true), M.blackMetal, { uv: false });
  shade.position.set(lx, 1.53, 0.06);
  g.add(shade);
  g.add(flowers(M, 0.42, 2).translateX(len / 2 - 0.22).translateY(0.902).translateZ(-0.14));
  if (sink !== undefined) {
    g.add(box(0.5, 0.003, 0.38, M.steel, sink, 0.9035, 0.02));
    g.add(cyl(0.016, 0.02, 0.06, M.steel, sink, 0.93, -0.2, 16));
    const spout = mesh(new THREE.TorusGeometry(0.11, 0.01, 10, 24, Math.PI), M.steel, { uv: false });
    spout.rotation.y = Math.PI / 2;
    spout.position.set(sink, 1.05, -0.09);
    g.add(spout);
  }
  if (cooktop !== undefined) {
    g.add(box(0.58, 0.01, 0.5, M.cooktop, cooktop, 0.907, 0.02));
    for (const [dx, dz] of [[-0.15, -0.1], [0.15, -0.1], [-0.15, 0.13], [0.15, 0.13]]) {
      const ring = mesh(new THREE.TorusGeometry(0.075, 0.008, 6, 24), M.blackMetal, { uv: false, cast: false });
      ring.rotation.x = Math.PI / 2;
      ring.position.set(cooktop + dx, 0.916, 0.02 + dz);
      g.add(ring);
    }
  }
  return g;
}

export function tallUnit(M) {
  const g = new THREE.Group();
  g.add(box(0.6, 2.3, 0.6, M.kitchenGrey, 0, 1.15, -0.01));
  g.add(box(0.594, 1.38, 0.02, M.kitchenGrey, 0, 0.8, 0.3));
  g.add(box(0.594, 0.8, 0.02, M.kitchenGrey, 0, 1.894, 0.3));
  for (const y of [1.35, 1.6]) g.add(cyl(0.012, 0.012, 0.02, M.blackMetal, -0.24, y, 0.31, 12).rotateX(Math.PI / 2));
  return g;
}

// Round oak table on splayed legs.
export function diningTable(M) {
  const g = new THREE.Group();
  g.add(cyl(0.45, 0.45, 0.03, M.oakVeneer, 0, 0.745, 0, 48));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const leg = cyl(0.022, 0.016, 0.74, M.oakVeneer, Math.cos(a) * 0.24, 0.37, Math.sin(a) * 0.24, 12);
    leg.rotation.set(Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12);
    g.add(leg);
  }
  g.add(flowers(M, 0.5, 0).translateY(0.76));
  return g;
}

// Black bentwood café chair (bent hoop back, round seat).
export function diningChair(M) {
  const g = new THREE.Group();
  g.add(cyl(0.2, 0.2, 0.03, M.bentwood, 0, 0.46, 0, 32));
  g.add(mesh(new THREE.TorusGeometry(0.2, 0.012, 8, 32), M.bentwood, { uv: false }).rotateX(Math.PI / 2).translateZ(-0.43));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const leg = cyl(0.013, 0.011, 0.46, M.bentwood, Math.cos(a) * 0.15, 0.23, Math.sin(a) * 0.15, 10);
    leg.rotation.set(Math.sin(a) * 0.1, 0, -Math.cos(a) * 0.1);
    g.add(leg);
  }
  const hoop = mesh(new THREE.TorusGeometry(0.17, 0.012, 8, 40, Math.PI), M.bentwood, { uv: false });
  hoop.position.set(0, 0.62, -0.16);
  hoop.rotation.x = -0.12;
  g.add(hoop);
  for (const s of [-1, 1]) g.add(cyl(0.012, 0.012, 0.18, M.bentwood, s * 0.17, 0.54, -0.165, 8));
  const inner = mesh(new THREE.TorusGeometry(0.11, 0.009, 8, 32, Math.PI), M.bentwood, { uv: false });
  inner.position.set(0, 0.62, -0.165);
  inner.rotation.x = -0.12;
  g.add(inner);
  return g;
}

// Built-in, floor-to-ceiling wardrobe: handleless oak fronts with shadow gaps, one lit bronze-glass display
// section (hanging clothes + shelves inside), slim black pulls, and an LED strip washing the fronts from above.
export function builtInWardrobe(M, w, h) {
  const g = new THREE.Group(), d = 0.62;
  const n = Math.max(2, Math.round(w / 0.55)), dw = w / n;
  const glassIdx = n >= 3 ? n - 1 : -1;
  M.wardGlass ??= new THREE.MeshPhysicalMaterial({ color: 0x8a6e52, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.35, depthWrite: false });
  M.wardLight ??= new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffd9a8, emissiveIntensity: 1.6 });
  M.wardInside ??= new THREE.MeshStandardMaterial({ color: 0x5a4a3c, roughness: 0.7 });
  g.add(box(w, h, d - 0.04, M.oakVeneer, 0, h / 2, -0.02));
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + dw * (i + 0.5);
    if (i === glassIdx) {
      // lit interior: dark walnut back, glowing top, shelf stack and a few hanging garments
      g.add(box(dw - 0.02, h - 0.04, 0.02, M.wardInside, x, h / 2, -d / 2 + 0.03));
      g.add(box(dw - 0.04, 0.012, d - 0.12, M.wardLight, x, h - 0.06, 0));
      for (let k = 0; k < 3; k++) g.add(box(dw - 0.04, 0.025, d - 0.12, M.oakVeneer, x, 0.3 + k * 0.35, 0));
      g.add(box(dw - 0.04, 0.012, 0.012, M.brass, x, h - 0.35, 0));
      const cols = [M.linenSand, M.chairFabric, M.throwRust, M.linenWhite];
      for (let k = 0; k < 4; k++) g.add(box(0.05, 0.85, 0.42, cols[k], x - dw / 2 + 0.1 + k * ((dw - 0.2) / 3), h - 0.8, 0, { r: 0.02 }));
      g.add(box(dw - 0.006, h - 0.02, 0.01, M.wardGlass, x, h / 2, d / 2 - 0.01, { cast: false }));
      g.add(box(0.02, h - 0.02, 0.025, M.blackMetal, x - dw / 2 + 0.01, h / 2, d / 2 - 0.01));
      g.add(box(0.02, h - 0.02, 0.025, M.blackMetal, x + dw / 2 - 0.01, h / 2, d / 2 - 0.01));
    } else {
      g.add(box(dw - 0.005, h - 0.02, 0.022, M.oakVeneer, x, h / 2, d / 2 - 0.011, { offset: [i * 0.37, 0] }));
      // slim black recessed pull on the meeting edge of each door pair
      const side = i % 2 === 0 ? 1 : -1;
      g.add(box(0.015, 0.6, 0.02, M.blackMetal, x + side * (dw / 2 - 0.035), 1.05, d / 2 + 0.006));
    }
  }
  // LED wash strip along the top
  g.add(box(w, 0.02, 0.03, M.wardLight, 0, h + 0.01, d / 2 - 0.02, { cast: false }));
  return g;
}

// Wall-mounted TV over a slim floating oak console.
export function wallTV(M, w = 1.3) {
  const g = new THREE.Group();
  g.add(box(w + 0.2, 0.22, 0.34, M.oakVeneer, 0, 0.42, 0, { r: 0.004 }));
  g.add(box(w + 0.22, 0.02, 0.35, M.stoneTop, 0, 0.54, 0));
  g.add(box(w, w * 0.57, 0.03, M.screen, 0, 1.35, -0.15));
  g.add(box(w + 0.01, w * 0.57 + 0.01, 0.015, M.blackMetal, 0, 1.35, -0.165));
  g.add(flowers(M, 0.3, 2).translateX(-w * 0.42).translateY(0.55));
  return g;
}

// Upholstered bench for the foot of the bed.
export function bench(M, w = 1.2) {
  const g = new THREE.Group();
  for (const s of [-1, 1]) g.add(box(0.03, 0.4, 0.36, M.blackMetal, s * (w / 2 - 0.06), 0.2, 0));
  const top = mesh(pillowGeo(w, 0.14, 0.4, 0.15, 6), M.ottoman ?? M.sofaFabric);
  top.position.y = 0.44;
  g.add(top);
  return g;
}

// Fresh flowers in a vase: kinds 0 = white roses (ceramic), 1 = blush peonies (glass), 2 = eucalyptus (stone).
export function flowers(M, h = 0.45, kind = 0) {
  M.petalWhite ??= new THREE.MeshStandardMaterial({ color: 0xf6f1ea, roughness: 0.7 });
  M.petalBlush ??= new THREE.MeshStandardMaterial({ color: 0xe9b9ad, roughness: 0.7 });
  M.stem ??= new THREE.MeshStandardMaterial({ color: 0x5c7350, roughness: 0.7 });
  M.euca ??= new THREE.MeshStandardMaterial({ color: 0x8aa294, roughness: 0.8, side: THREE.DoubleSide });
  M.vaseGlass ??= new THREE.MeshPhysicalMaterial({ color: 0xdfe7e4, roughness: 0.05, transparent: true, opacity: 0.35, depthWrite: false });
  const g = new THREE.Group();
  const vh = h * 0.42;
  const vm = kind === 0 ? M.ceramic : kind === 1 ? M.vaseGlass : M.stoneTop;
  const pts = [[0, 0], [0.055, 0], [0.07, vh * 0.35], [0.06, vh * 0.75], [0.04, vh], [0, vh]].map(([r, y]) => new THREE.Vector2(r * (h / 0.45), y));
  g.add(mesh(new THREE.LatheGeometry(pts, 24), vm, { uv: false }));
  let s = kind * 31 + 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const stems = kind === 2 ? 7 : 9;
  for (let i = 0; i < stems; i++) {
    const a = rnd() * Math.PI * 2, tilt = 0.15 + rnd() * 0.35, len = h * (0.75 + rnd() * 0.35);
    const stem = cyl(0.004, 0.004, len, M.stem, 0, vh + len / 2 - 0.04, 0, 5, { cast: false });
    const tip = new THREE.Vector3(Math.sin(tilt) * Math.cos(a) * len * 0.5, vh + len * 0.92, Math.sin(tilt) * Math.sin(a) * len * 0.5);
    stem.position.set(tip.x / 2, (vh + tip.y) / 2, tip.z / 2);
    stem.lookAt(stem.position.clone().add(new THREE.Vector3(tip.x, tip.y - vh, tip.z)));
    stem.rotateX(Math.PI / 2);
    g.add(stem);
    if (kind === 2) {
      for (let k = 0; k < 5; k++) {
        const leaf = mesh(new THREE.CircleGeometry(0.022, 10), M.euca, { uv: false, cast: false });
        const t = 0.35 + k * 0.14;
        leaf.position.set(tip.x * t, vh + (tip.y - vh) * t, tip.z * t);
        leaf.rotation.set(rnd() * 3, rnd() * 3, 0);
        g.add(leaf);
      }
    } else {
      const bloom = mesh(new THREE.SphereGeometry(0.035 * (h / 0.45), 12, 8), i % 3 === 0 && kind === 1 ? M.petalWhite : kind === 1 ? M.petalBlush : M.petalWhite, { uv: false });
      bloom.scale.set(1, 0.75, 1);
      bloom.position.copy(tip);
      g.add(bloom);
      const leaf = mesh(new THREE.CircleGeometry(0.03, 8), M.euca, { uv: false, cast: false });
      leaf.position.set(tip.x * 0.6, vh + (tip.y - vh) * 0.55, tip.z * 0.6);
      leaf.rotation.set(rnd() * 3, rnd() * 3, 0);
      g.add(leaf);
    }
  }
  return g;
}
