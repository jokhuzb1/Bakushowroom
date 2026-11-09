// "Hi-tech" design package for the 360° show-flats: anthracite stone floors, graphite joinery, gloss black
// kitchen, neutral 4000 K linear lighting, glass and chrome furniture. Same room layouts as Warm Minimal
// (every piece keeps its footprint), so each tour stop is the same viewpoint in both designs.
// The furniture models are written in sand3d: tools/sand3d/hitech_kit.py.
import * as THREE from 'three';
import { model } from '../building/models.js';
import { fbm } from '../textures.js';

const std = (p) => new THREE.MeshStandardMaterial(p);

// large-format slabs with hairline joints; two slabs per texture repeat
const slabs = new Map();
function slabTexture(color, joint, size) {
  const key = `${color}-${joint}-${size}`;
  if (slabs.has(key)) return slabs.get(key);
  const S = 512, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = color;
  g.fillRect(0, 0, S, S);
  // soft cloudy mottling, so the slabs read as honed stone rather than flat paint
  const img = g.getImageData(0, 0, S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const n = (fbm(x / S, y / S, 5, 5, 5, 11) - 0.5) * 26, i = (y * S + x) * 4;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  g.fillStyle = joint;
  for (const p of [0, S / 2]) { g.fillRect(p, 0, 2, S); g.fillRect(0, p, S, 2); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.userData.world = size * 2;
  slabs.set(key, t);
  return t;
}

// wall art: thin luminous contour lines on black, the one graphic element in the rooms
let artTex;
function contourArt(seed) {
  const W = 1024, H = 640, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#0b0d11';
  g.fillRect(0, 0, W, H);
  const hue = seed === 1 ? '125, 205, 235' : '225, 232, 240';
  for (let i = 0; i < 46; i++) {
    g.strokeStyle = `rgba(${hue}, ${0.12 + (i % 7 === 0 ? 0.65 : 0.22)})`;
    g.lineWidth = i % 7 === 0 ? 2.4 : 1.1;
    g.beginPath();
    for (let x = 0; x <= W; x += 8) {
      const u = x / W, y = H * (0.12 + i * 0.017) + Math.sin(u * 5 + seed + i * 0.09) * (34 + i * 1.8) + Math.sin(u * 13 + i * 0.21) * 12;
      if (x) g.lineTo(x, y); else g.moveTo(x, y);
    }
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// SM: the show-flat material kit (showflat.js). Returns a restyled copy; SM's materials are shared and stay as they are.
export function hiTechKit(SM) {
  const K = { ...SM };
  const tint = (m, color, extra = {}) => { const c = m.clone(); c.color.set(color); Object.assign(c, extra); return c; };
  const plain = (color, roughness, metalness = 0) => std({ color, roughness, metalness });

  // surfaces
  K.oak = std({ map: slabTexture('#3b3d41', '#1b1c1f', 1.2), roughness: 0.24 });
  K.stone = std({ map: slabTexture('#2d2f33', '#141517', 0.6), roughness: 0.3 });
  K.wallTile = std({ map: slabTexture('#b6babf', '#74777c', 1.2), roughness: 0.2 });
  K.trim = plain(0x131417, 0.4, 0.5); // a black shadow line instead of a painted skirting
  K.paint = plain(0xd6d9dd, 0.72);
  // joinery: graphite and gloss black in place of the wood veneers
  K.oakVeneer = plain(0x2b2d31, 0.34, 0.65);
  K.walnutVeneer = plain(0x121316, 0.22, 0.3);
  K.oakWood = plain(0x232529, 0.36, 0.5);
  K.walnut = plain(0x1b1c1f, 0.3, 0.4);
  K.darkWood = plain(0x17181b, 0.2, 0.4);
  K.whiteMatte = plain(0xd9dbde, 0.4);
  K.kitchenGrey = plain(0x101114, 0.14, 0.1);
  K.quartz = plain(0xe9ebed, 0.12);
  K.stoneTop = plain(0xe4e6e9, 0.16);
  K.brass = plain(0xb9bdc2, 0.26, 1);
  K.bentwood = plain(0x141518, 0.32, 0.6);
  // upholstery: cool greys, one deep teal accent
  K.sofaFabric = tint(SM.sofaFabric, 0x3b3d42);
  K.linenWhite = tint(SM.linenWhite, 0xdfe1e4);
  K.linenSand = tint(SM.linenSand, 0x6d7076);
  K.throwRust = tint(SM.throwRust, 0x1d5f73);
  K.headboard = tint(SM.headboard, 0x26272b);
  K.fabricWall = tint(SM.fabricWall, 0x2a2b2f);
  K.curtain = tint(SM.curtain, 0x4c4e54);
  K.rug = tint(SM.rug, 0x54565c);
  K.chairFabric = tint(SM.chairFabric, 0x2e3035);
  K.ottoman = tint(SM.ottoman, 0x26272b);
  K.potWhite = plain(0x1c1d20, 0.3, 0.4);
  K.terracotta = plain(0x26272a, 0.35, 0.3);
  // light: neutral white everywhere
  const glow = (intensity) => std({ color: 0xffffff, emissive: 0xf3f6ff, emissiveIntensity: intensity });
  K.bulb = glow(1.6);
  K.led = glow(1.2);
  K.wardLight = glow(2.2);
  K.ledLine = glow(3.5);
  K.lampShade = std({ color: 0xf2f4f7, roughness: 0.3, emissive: 0xf3f6ff, emissiveIntensity: 0.25, side: THREE.DoubleSide });
  K.wardGlass = new THREE.MeshPhysicalMaterial({ color: 0x5c6066, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.35, depthWrite: false });
  K.wardInside = plain(0x1a1b1e, 0.5);
  artTex ??= [contourArt(1), contourArt(2)];
  K.artworks = artTex.map((t) => std({ map: t, roughness: 0.25 }));
  // the shell's lighting (showflat.js)
  K.lighting = { led: 0xf3f6ff, ledPower: 3.2, spot: 0xf6f8ff, room: 0xf2f4fa, bakeColor: 0xf2f4fa, slots: true, bakePower: 0.6 };
  // pieces with their own hi-tech model; interior.js falls back to the standard piece for any it can't find
  K.swap = {
    coffeeTable: () => model(SM.lib, 'ht_coffee_table', { w: 1.0 }),
    diningTable: () => model(SM.lib, 'ht_dining_table', { w: 0.9 }),
    diningChair: () => model(SM.lib, 'ht_chair', { d: 0.5 }),
    floorLamp: () => model(SM.lib, 'ht_floor_lamp', { h: 1.85 }),
    pendant: () => model(SM.lib, 'ht_pendant', { w: 1.2 }),
  };
  return K;
}
