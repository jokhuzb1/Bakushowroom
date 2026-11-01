// Style kit: one place that decides how every surface type looks.
// Swapping this object (e.g. "Scandi", "Classic") restyles every unit generated from a plan.
import * as THREE from 'three';

export function createMaterials(T) {
  const std = (p) => new THREE.MeshStandardMaterial(p);
  const phys = (p) => new THREE.MeshPhysicalMaterial(p);
  const surf = (t, extra = {}) => std({ map: t.map, roughnessMap: t.roughnessMap, normalMap: t.normalMap, ...extra });

  const M = {
    // floors / walls
    oak: surf(T.oak, { color: 0xc9ab8a, normalScale: new THREE.Vector2(0.5, 0.5) }),
    deck: surf(T.deck, { normalScale: new THREE.Vector2(0.8, 0.8) }),
    stone: surf(T.stone, { color: 0xb3a797, normalScale: new THREE.Vector2(0.6, 0.6) }),
    wallTile: surf(T.wallTile, { color: 0xd3c8ba, normalScale: new THREE.Vector2(0.5, 0.5) }),
    plaster: surf(T.plaster, { color: 0xf4efe6, normalScale: new THREE.Vector2(0.25, 0.25) }),
    plasterExt: surf(T.plaster, { color: 0xd9d4cb, normalScale: new THREE.Vector2(0.4, 0.4) }),
    ceiling: std({ color: 0xfbfaf7, roughness: 0.95 }),
    concrete: surf(T.concrete),
    skirting: std({ color: 0xefede8, roughness: 0.55 }),

    // joinery
    oakWood: surf(T.oakWood, { normalScale: new THREE.Vector2(0.3, 0.3) }),
    walnut: surf(T.walnut, { normalScale: new THREE.Vector2(0.3, 0.3) }),
    whiteMatte: std({ color: 0xcfc4b5, roughness: 0.6 }),
    cabinetGreen: std({ color: 0x56635a, roughness: 0.55 }),
    marble: surf(T.marble, { normalScale: new THREE.Vector2(0.1, 0.1) }),
    doorWhite: std({ color: 0xc8baa8, roughness: 0.45 }),

    // metals / glass
    blackMetal: std({ color: 0x1c1c1c, metalness: 0.7, roughness: 0.38 }),
    frame: std({ color: 0x2b2c2e, metalness: 0.6, roughness: 0.42 }),
    brass: std({ color: 0xb8925a, metalness: 1, roughness: 0.28 }),
    chrome: std({ color: 0xdedede, metalness: 1, roughness: 0.06 }),
    steel: std({ color: 0xb9b9b9, metalness: 1, roughness: 0.25 }),
    glass: phys({ color: 0xffffff, metalness: 0, roughness: 0, transmission: 1, ior: 1.5, thickness: 0.01, transparent: false }),
    // no real-time reflections: a soft, darker mirror instead of one that shows the outdoor sky
    mirror: std({ color: 0x8c9396, metalness: 1, roughness: 0.18, envMapIntensity: 0.35 }),

    // soft goods
    sofaFabric: surf(T.fabric, { color: 0x8f8170 }),
    linenWhite: surf(T.linen, { color: 0xe2d9cc }),
    linenSand: surf(T.linen, { color: 0xb9a389 }),
    throwRust: surf(T.fabric, { color: 0x9c5b3c }),
    headboard: surf(T.fabric, { color: 0x8e8578 }),
    curtain: surf(T.linen, { color: 0xbfae98, side: THREE.DoubleSide }),
    chairFabric: surf(T.fabric, { color: 0x6f7368 }),
    towel: surf(T.fabric, { color: 0xb8a690 }),
    rug: std({ color: 0xc9bba8, map: T.rug.map, normalMap: T.rug.normalMap, roughness: 1 }),

    // ceramics / misc
    ceramic: phys({ color: 0xf7f7f5, roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.03 }),
    terracotta: std({ color: 0xb36b4a, roughness: 0.85 }),
    potWhite: std({ color: 0xa69684, roughness: 0.5 }),
    leaf: std({ color: 0x3e5a2e, roughness: 0.55, side: THREE.DoubleSide }),
    leafDark: std({ color: 0x2d4524, roughness: 0.6, side: THREE.DoubleSide }),
    soil: std({ color: 0x2a211b, roughness: 1 }),
    screen: std({ color: 0x050506, roughness: 0.12, metalness: 0.2 }),
    cooktop: std({ color: 0x0a0a0a, roughness: 0.08 }),
    book1: std({ color: 0x7a3b2e, roughness: 0.8 }),
    book2: std({ color: 0x2f4a5c, roughness: 0.8 }),
    book3: std({ color: 0xd9cdb6, roughness: 0.8 }),
    lampShade: std({ color: 0xf2e9da, roughness: 0.9, emissive: 0xffd8a0, emissiveIntensity: 0.15, side: THREE.DoubleSide }),
    bulb: std({ color: 0xffffff, emissive: 0xffd9a8, emissiveIntensity: 1.2 }),
    downlight: std({ color: 0xf8f6f2, roughness: 0.3 }),
    led: std({ color: 0xffffff, emissive: 0xffe2b8, emissiveIntensity: 0.8 }),
    blackGlass: std({ color: 0x111111, roughness: 0.05, metalness: 0.1 }),
    art1: std({ color: 0xc9a27e, roughness: 0.9 }),
    art2: std({ color: 0x51594a, roughness: 0.9 }),
    canvas: std({ color: 0xece6da, roughness: 0.95 }),
  };

  for (const m of Object.values(M)) if (m !== M.mirror) m.envMapIntensity = 1;
  return M;
}

// Upgrades the kit with scanned textures where available (real oak floor, tiles, veneers, fabric).
export function applyScanned(M, S) {
  const surf = (set, extra = {}) => new THREE.MeshStandardMaterial({ map: set.map, roughnessMap: set.roughnessMap, normalMap: set.normalMap, ...extra });
  if (S.laminate_floor_02?.map) M.oak = surf(S.laminate_floor_02, { color: 0xe8dccb, normalScale: new THREE.Vector2(0.6, 0.6) });
  if (S.interior_tiles?.map) M.wallTile = surf(S.interior_tiles, { color: 0xf1ece4 });
  if (S.long_white_tiles?.map) M.stone = surf(S.long_white_tiles, { color: 0xc9c0b4 });
  if (S.oak_veneer_01?.map) M.oakVeneer = surf(S.oak_veneer_01, { color: 0xf0e2cf, roughness: 0.55 });
  if (S.natural_walnut_veneer?.map) M.walnutVeneer = surf(S.natural_walnut_veneer, { roughness: 0.5 });
  if (S.hessian_230?.map) M.fabricWall = surf(S.hessian_230, { color: 0xb3a28d, normalScale: new THREE.Vector2(1.2, 1.2) });
  M.oakVeneer ??= M.oakWood;
  M.walnutVeneer ??= M.walnut;
  M.fabricWall ??= M.headboard;
  M.trim = new THREE.MeshStandardMaterial({ color: 0xece5da, roughness: 0.45 });
  return M;
}
