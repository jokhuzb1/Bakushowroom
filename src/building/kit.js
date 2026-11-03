// Interior material kit: textures, the furniture model library and the style palette, loaded once.
// Shared by the showroom and the 360° bake so both furnish rooms identically.
import * as THREE from 'three';
import { loadTextures, loadScannedTextures } from '../textures.js';
import { createMaterials, applyScanned } from '../materials.js';
import { loadModels } from './models.js';
import * as STYLE from '../styles/warmMinimal.js';

// M: the building materials; its wall plaster gets the scanned plaster texture too.
export async function loadInteriorKit(M) {
  const [tex, lib, scanned] = await Promise.all([loadTextures(), loadModels(), loadScannedTextures()]);
  const K = createMaterials(tex);
  applyScanned(K, scanned);
  STYLE.palette(K);
  // real plaster on every wall of the building (its UVs were laid out at 1.5 m per repeat)
  const p = scanned.beige_wall_001;
  if (p?.map) {
    for (const k of ['map', 'roughnessMap', 'normalMap']) {
      if (!p[k]) continue;
      const t = p[k].clone();
      t.repeat.setScalar(1.5 / p.world);
      t.needsUpdate = true;
      M.wall[k] = t;
    }
    M.wall.color.setRGB(1.32, 1.3, 1.28); // the scan is darker and warmer than the soft off-white paint we want
    M.wall.normalScale = new THREE.Vector2(0.5, 0.5);
    M.wall.needsUpdate = true;
  }
  return Object.assign(K, { lib });
}
