// Material kit for the "Baku City" exterior: cream limestone, bronze frames, dark reflective glazing.
import * as THREE from 'three';
import { fbm } from '../textures.js';

function stoneTexture(seed) {
  const S = 256, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const img = g.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const n = fbm(x / S, y / S, 6, 6, 5, seed), p = fbm(x / S, y / S, 48, 48, 2, seed + 3);
    const v = 236 + (n - 0.5) * 22 + (p > 0.75 ? -8 : 0);
    const i = (y * S + x) * 4;
    img.data[i] = v; img.data[i + 1] = v - 2; img.data[i + 2] = v - 6; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.userData.world = 2.5;
  return t;
}

export function buildingMaterials() {
  const stoneMap = stoneTexture(5);
  const std = (p) => new THREE.MeshStandardMaterial(p);
  return {
    stone: std({ color: 0xdac39d, map: stoneMap, roughness: 0.85 }),
    stoneLight: std({ color: 0xe8d7b6, map: stoneMap, roughness: 0.8 }),
    stoneDark: std({ color: 0xbfa985, map: stoneMap, roughness: 0.9 }),
    wall: std({ color: 0xd8cdbf, roughness: 0.9 }), // warm greige paint

    ceiling: std({ color: 0xe9e2d7, roughness: 0.95 }),
    floor: std({ color: 0xcdb99c, roughness: 0.8 }),
    glass: std({ color: 0x33424f, metalness: 0.7, roughness: 0.05, transparent: true, opacity: 0.62, depthWrite: false, side: THREE.DoubleSide }),
    frame: std({ color: 0x3a2d24, metalness: 0.4, roughness: 0.45 }),
    iron: std({ color: 0x1e1d1b, metalness: 0.6, roughness: 0.4 }),
    shopGlass: std({ color: 0xa9bcc4, metalness: 0.2, roughness: 0.05, transparent: true, opacity: 0.28 }),
    shopInterior: std({ color: 0x5e4630, emissive: 0xffc98a, emissiveIntensity: 1.1, roughness: 0.9 }),
    terrace: std({ color: 0x8c4333, roughness: 0.75 }),
    roof: std({ color: 0x8d8a84, roughness: 0.95 }),
    solar: std({ color: 0x1b2946, metalness: 0.6, roughness: 0.22 }),
  };
}
