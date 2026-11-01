// Library of real 3D furniture/décor models (Poly Haven, CC0) in public/models, loaded once and reused.
// Models face +z with their base at y = 0, matching the procedural furniture convention.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const MODEL_IDS = [
  'coffee_table_round_01', 'modern_coffee_table_01', 'modern_wooden_cabinet', 'modern_arm_chair_01', 'mid_century_lounge_chair',
  'modern_ceiling_lamp_01', 'side_table_01', 'drawer_cabinet', 'dining_chair_02',
  'potted_plant_01', 'potted_plant_02', 'potted_plant_04', 'ceramic_vase_01', 'ceramic_vase_02', 'ceramic_vase_04',
  'wooden_bowl_01', 'wicker_basket_02', 'book_encyclopedia_set_01', 'throw_pillows_01',
];

// quantized (int16) attributes -> float, so geometry can be transformed and merged
function toFloat(geo) {
  for (const k of Object.keys(geo.attributes)) {
    const a = geo.attributes[k];
    if (a.array instanceof Float32Array && !a.isInterleavedBufferAttribute) continue;
    const out = new Float32Array(a.count * a.itemSize);
    for (let i = 0; i < a.count; i++) for (let j = 0; j < a.itemSize; j++) out[i * a.itemSize + j] = a.getComponent(i, j);
    geo.setAttribute(k, new THREE.BufferAttribute(out, a.itemSize));
  }
  return geo;
}

export async function loadModels(onProgress) {
  const loader = new GLTFLoader();
  const lib = {};
  let n = 0;
  await Promise.all(MODEL_IDS.map(async (id) => {
    try {
      const scene = (await loader.loadAsync(`/models/${id}.glb`)).scene;
      scene.updateMatrixWorld(true);
      // bake node transforms into float geometry so instances can be merged later
      const root = new THREE.Group();
      scene.traverse((o) => {
        if (!o.isMesh) return;
        const g = toFloat(o.geometry.clone());
        g.applyMatrix4(o.matrixWorld);
        if (!g.attributes.normal) g.computeVertexNormals();
        const m = new THREE.Mesh(g, o.material);
        m.castShadow = m.receiveShadow = true;
        root.add(m);
      });
      // base on the floor, centred on x/z
      const box = new THREE.Box3().setFromObject(root), c = box.getCenter(new THREE.Vector3());
      for (const m of root.children) m.geometry.translate(-c.x, -box.min.y, -c.z);
      root.userData.size = box.getSize(new THREE.Vector3());
      lib[id] = root;
    } catch (e) {
      console.warn('model failed', id, e);
    }
    onProgress?.(++n / MODEL_IDS.length);
  }));
  return lib;
}

// An instance of a library model, scaled uniformly so its footprint fits w x d (and height h if given).
export function model(lib, id, { w, d, h, rotY = 0 } = {}) {
  const src = lib?.[id];
  if (!src) return null;
  const s = src.userData.size;
  const k = Math.min(w ? w / s.x : Infinity, d ? d / s.z : Infinity, h ? h / s.y : Infinity);
  const g = new THREE.Group();
  for (const m of src.children) {
    const c = new THREE.Mesh(m.geometry, m.material);
    c.castShadow = c.receiveShadow = true;
    g.add(c);
  }
  if (Number.isFinite(k)) g.scale.setScalar(k);
  g.rotation.y = rotY;
  const holder = new THREE.Group();
  holder.add(g);
  holder.userData.size = s.clone().multiplyScalar(Number.isFinite(k) ? k : 1);
  return holder;
}
