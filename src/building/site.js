// The plot around the tower: boulevard on the street side, sidewalks, cypress trees, street lamps
// and low-detail neighbouring blocks in the same cream stone.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rand, fbm } from '../textures.js';
import { CX, CY } from './model.js';
import { facadeTexture } from './complex.js';
import { buildBackdrop } from './backdrop.js';

const X = (x) => x - CX, Z = (y) => y - CY;

// Ground cover: a tiling noise texture (world metres per repeat) so lawns and roads aren't flat colour.
// `grain` adds fine speckle (asphalt aggregate, paving joints) over the soft blotches.
function groundTex(base, { blotch = 0.12, grain = 0.06, joints = 0, seed = 1 } = {}) {
  const S = 512, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const img = g.createImageData(S, S), d = img.data;
  const col = new THREE.Color(base), R = rand(seed);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S;
      let k = 1 + (fbm(u, v, 4, 4, 4, seed) - 0.5) * 2 * blotch + (R() - 0.5) * 2 * grain;
      if (joints && (x % (S / joints) < 2 || y % (S / joints) < 2)) k *= 0.82;
      const i = (y * S + x) * 4;
      d[i] = Math.min(255, col.r * 255 * k); d[i + 1] = Math.min(255, col.g * 255 * k); d[i + 2] = Math.min(255, col.b * 255 * k); d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
const repeat = (t, w, d, metres) => { const c = t.clone(); c.repeat.set(w / metres, d / metres); c.needsUpdate = true; return c; };

// Soft, lumpy foliage: geometry centred on the origin is pushed in and out by smooth noise and given vertex
// colours from the shaded underside to the sunlit top, with a per-tree tint, so a row of trees doesn't read
// as identical faceted green balls.
const DARK_LEAF = new THREE.Color(0x15260e), LIGHT_LEAF = new THREE.Color(0x4f7d28);
function foliage(geo, R, { lumps = 2.2, amp = 0.16, dark = DARK_LEAF, light = LIGHT_LEAF } = {}) {
  geo.computeBoundingBox();
  const { min, max } = geo.boundingBox;
  const p = geo.attributes.position, col = new Float32Array(p.count * 3);
  const ph = [R() * 9, R() * 9, R() * 9], tint = 0.85 + R() * 0.3;
  const v = new THREE.Vector3(), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const t = (v.y - min.y) / (max.y - min.y);
    v.multiplyScalar(1 + amp * Math.sin(v.x * lumps + ph[0]) * Math.sin(v.y * lumps + ph[1]) * Math.sin(v.z * lumps + ph[2]));
    p.setXYZ(i, v.x, v.y, v.z);
    c.copy(dark).lerp(light, t ** 0.8).multiplyScalar(tint);
    col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  return geo;
}
// a broadleaf canopy of a few overlapping lobes
function canopy(R, s) {
  const lobes = [];
  const n = 3 + Math.floor(R() * 3);
  for (let i = 0; i < n; i++) {
    const r = s * (0.55 + R() * 0.25), a = R() * Math.PI * 2, off = i === 0 ? 0 : s * 0.45;
    lobes.push(foliage(new THREE.SphereGeometry(r, 18, 12), R, { lumps: 2.6 / s })
      .translate(Math.cos(a) * off, (R() - 0.3) * s * 0.4, Math.sin(a) * off));
  }
  return mergeGeometries(lobes);
}
// a slim Italian cypress: a pointed lathe profile, finely lumped
function cypress(R, h) {
  const pts = [];
  for (let i = 0; i <= 14; i++) {
    const t = i / 14;
    pts.push(new THREE.Vector2(0.62 * Math.sin(Math.PI * Math.min(1, t * 1.15)) ** 0.7 * (1 - t * 0.55) + 0.01, (t - 0.5) * h));
  }
  return foliage(new THREE.LatheGeometry(pts, 14), R, { lumps: 7, amp: 0.1, dark: new THREE.Color(0x1c2e19), light: new THREE.Color(0x4d6b38) });
}

function facadeTex(seed) {
  const S = 256, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const R = rand(seed);
  g.fillStyle = '#ddcbaa';
  g.fillRect(0, 0, S, S);
  for (let fy = 0; fy < 2; fy++) for (let bx = 0; bx < 2; bx++) {
    const x = bx * 128, y = fy * 128;
    g.fillStyle = R() > 0.85 ? '#d8b77d' : '#3a3f45';
    g.fillRect(x + 34, y + 22, 60, 88);
    g.fillStyle = '#efe3cc';
    g.fillRect(x + 28, y + 108, 72, 8);
  }
  g.fillStyle = '#e9dcc3';
  g.fillRect(0, 0, 8, S); g.fillRect(124, 0, 8, S);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function blockGeo(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d);
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    const u = ax > 0.5 ? p.getZ(i) : p.getX(i);
    if (ay > 0.5) uv.setXY(i, 0.02, 0.02);
    else uv.setXY(i, u / 6.4, (p.getY(i) + h / 2) / 6.08);
  }
  return g;
}

// The pedestrian crossing over the boulevard (world coordinates), in line with the garden opening: from it a
// visitor sees the whole street front. The street view stands here.
export const CROSSWALK = { x: 23.7, width: 3.2, z0: -38.1, z1: -22.1 };
export const STREET_VIEWS = [
  { id: 'crosswalk', name: 'Crosswalk', pos: [23.7, 1.6, -30.0], look: [0, 3.2, -17.9] },
  { id: 'frontage', name: 'Street front', pos: [0, 1.6, -21.0], look: [0, 2.0, -17.9] },
];

export function buildSite() {
  const root = new THREE.Group();
  const std = (p) => new THREE.MeshStandardMaterial(p);
  // ground textures tile every `metres` (plane UVs are scaled to world size below)
  const ground = (base, metres, o) => Object.assign(std({ map: groundTex(base, o), roughness: o.rough ?? 0.95 }), { userData: { metres } });
  const asphalt = ground(0x4d4f52, 6, { blotch: 0.1, grain: 0.09, seed: 3 });
  const paving = ground(0xc2bbaf, 4, { blotch: 0.06, grain: 0.03, joints: 8, seed: 5, rough: 0.9 });
  const grass = ground(0x5f7c45, 9, { blotch: 0.22, grain: 0.08, seed: 9, rough: 1 });
  const paint = std({ color: 0xe8e6df, roughness: 0.8 });

  const plane = (w, d, mat, x, y, z) => {
    const geo = new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2);
    if (mat.userData.metres) {
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / mat.userData.metres, (uv.getY(i) * d) / mat.userData.metres);
    }
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.receiveShadow = true;
    root.add(m);
    return m;
  };
  plane(900, 900, grass, 0, -0.06, 0);
  // the complex plot (world coordinates: block 3A at the origin, street front facing -z)
  plane(110, 134, paving, 23, -0.03, 37);
  // courtyard lawns and the garden between 3A and the corner block
  plane(36, 22, grass, 22, -0.02, 57).position.y = -0.015;
  plane(9.5, 13, grass, 23.8, -0.015, -0.5);
  plane(20, 9, grass, -3, -0.015, 15.5);
  // boulevard in front of the building and the wide avenue along the -x side (as in the aerials)
  plane(500, 16, asphalt, 0, -0.02, -30.1);
  plane(22, 500, asphalt, -40, -0.02, 40);
  const marks = [];
  for (let x = -180; x < 180; x += 6) if (Math.abs(x - CROSSWALK.x) > 3) marks.push(new THREE.PlaneGeometry(3, 0.15).rotateX(-Math.PI / 2).translate(x, 0, 0));
  // zebra crossing over the boulevard at the garden opening, facing the street front (the street-view spot)
  const zebra = [];
  for (let z = -37.6; z <= -22.6; z += 1.0) zebra.push(new THREE.PlaneGeometry(CROSSWALK.width, 0.5).rotateX(-Math.PI / 2).translate(CROSSWALK.x, 0, z));
  const zebraMesh = new THREE.Mesh(mergeGeometries(zebra), paint);
  zebraMesh.position.y = -0.008;
  zebraMesh.receiveShadow = true;
  root.add(zebraMesh);
  const lane = new THREE.Mesh(mergeGeometries(marks), paint);
  lane.position.set(X(17.5), -0.01, Z(-21.0));
  root.add(lane);
  // parking bays along the boulevard
  const bays = [];
  for (let x = -2; x <= 82; x += 2.6) if (x < 35.5 || x > 47) bays.push(new THREE.PlaneGeometry(0.12, 5).rotateX(-Math.PI / 2).translate(X(x), 0, 0));
  const bayMesh = new THREE.Mesh(mergeGeometries(bays), paint);
  bayMesh.position.set(0, -0.01, Z(-15.5));
  root.add(bayMesh);

  // cypress trees and lamp posts along the street front
  const R = rand(77);
  const cyp = [], trunks = [], poles = [], lamps = [];
  root.userData.lamps = []; // their positions: the night view lights them (atmosphere.js)
  for (let x = 1.6; x < 82; x += 3.2) {
    if (x > 35 && x < 47.5) continue; // garden opening
    const h = 4.2 + R() * 1.4;
    cyp.push(cypress(R, h).translate(X(x), 0.4 + h / 2, Z(-13.2)));
    trunks.push(new THREE.CylinderGeometry(0.08, 0.1, 0.5, 6).translate(X(x), 0.25, Z(-13.2)));
  }
  for (let x = -1; x < 82; x += 6.4) {
    poles.push(new THREE.CylinderGeometry(0.05, 0.07, 4.2, 8).translate(X(x), 2.1, Z(-13.9)));
    lamps.push(new THREE.SphereGeometry(0.17, 12, 8).translate(X(x), 4.3, Z(-13.9)));
    root.userData.lamps.push([X(x), 4.3, Z(-13.9)]);
  }
  // the rest of the neighbourhood's street lighting (world coordinates)
  const post = (x, z) => {
    poles.push(new THREE.CylinderGeometry(0.05, 0.07, 4.2, 8).translate(x, 2.1, z));
    lamps.push(new THREE.SphereGeometry(0.17, 12, 8).translate(x, 4.3, z));
    root.userData.lamps.push([x, 4.3, z]);
  };
  for (let x = -120; x <= 140; x += 16) post(x, -38.8); // far side of the boulevard
  for (let x = -120; x <= -24; x += 16) post(x, -22.6);
  for (let x = 72; x <= 140; x += 16) post(x, -22.6);
  for (let z = -14; z <= 110; z += 14) post(-29, z); // the avenue, both sides
  for (let z = -80; z <= 160; z += 16) post(-51.5, z);
  for (let z = -12; z <= 100; z += 14) post(76, z); // the plot's far edges and its inner lanes
  for (let x = -28; x <= 76; x += 14) post(x, 102);
  for (let x = -10; x <= 44; x += 13.5) post(x, 45);
  for (let z = 12; z <= 72; z += 15) post(41, z);
  // low garden lights around the courtyard lawn and the garden by the gazebos
  root.userData.bollards = [];
  const bollard = (x, z) => {
    poles.push(new THREE.CylinderGeometry(0.035, 0.04, 0.8, 6).translate(x, 0.4, z));
    lamps.push(new THREE.SphereGeometry(0.07, 8, 6).translate(x, 0.84, z));
    root.userData.bollards.push([x, 0.84, z]);
  };
  for (let x = 5; x <= 39; x += 5.6) { bollard(x, 45.6); bollard(x, 68.4); }
  for (let z = 46; z <= 68; z += 5.5) { bollard(3.7, z); bollard(40.3, z); }
  for (let z = -6.5; z <= 5.5; z += 3) { bollard(18.8, z); bollard(28.8, z); }
  root.userData.bollards.push([23.8, 2.7, -3.5], [23.8, 2.7, 4.5]); // the gazebos' own lights
  // courtyard trees (world coordinates) and along the avenue
  const round = [];
  const spots = [];
  root.userData.trees = []; // for the night's fairy lights and the snow's drifts
  for (let i = 0; i < 26; i++) spots.push([6 + R() * 34, 46 + R() * 22]);
  for (let i = 0; i < 8; i++) spots.push([2 + R() * 30, 12 + R() * 6]);
  for (let z = -12; z < 100; z += 7) spots.push([-27, z]);
  for (const [x, z] of spots) {
    const s = 1.5 + R() * 1.2;
    round.push(canopy(R, s).translate(x, 2.4 + s, z));
    root.userData.trees.push([x, 2.4 + s, z, s]);
    trunks.push(new THREE.CylinderGeometry(0.12, 0.16, 2.6, 6).translate(x, 1.3, z));
  }
  // garden gazebos with red domes between 3A and the corner block
  const gaz = [], gazRoof = [];
  for (const [x, z] of [[23.8, -3.5], [23.8, 4.5]]) {
    gaz.push(new THREE.CylinderGeometry(1.6, 1.6, 0.3, 24).translate(x, 0.15, z));
    for (let a = 0; a < 6; a++) {
      const ang = (a / 6) * Math.PI * 2;
      gaz.push(new THREE.CylinderGeometry(0.09, 0.09, 2.6, 8).translate(x + Math.cos(ang) * 1.35, 1.6, z + Math.sin(ang) * 1.35));
    }
    gaz.push(new THREE.CylinderGeometry(1.7, 1.7, 0.3, 24).translate(x, 3.0, z));
    gazRoof.push(new THREE.SphereGeometry(1.55, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2).translate(x, 3.1, z));
  }
  const add = (geos, mat) => {
    const m = new THREE.Mesh(mergeGeometries(geos), mat);
    m.castShadow = true;
    m.receiveShadow = true;
    root.add(m);
  };
  add(cyp, std({ vertexColors: true, roughness: 0.85 }));
  add(round, std({ vertexColors: true, roughness: 0.85 }));
  add(trunks, std({ color: 0x4a3a2c, roughness: 1 }));
  add(poles, std({ color: 0x1f1f1f, metalness: 0.5, roughness: 0.5 }));
  add(lamps, std({ color: 0xfff3dc, emissive: 0xffe2b0, emissiveIntensity: 0.8 }));
  add(gaz, std({ color: 0xeee2c8, roughness: 0.8 }));
  add(gazRoof, std({ color: 0x9a3b2c, metalness: 0.3, roughness: 0.45 }));

  // neighbouring blocks (the U-shaped site plan): cream towers with a window texture
  // neighbours in the same classical stone language as the complex, plus a few plainer modern blocks
  const classic = [0, 1, 2].map((v) => std({ name: 'facade', map: facadeTexture(v), roughness: 0.85 }));
  const modern = [11, 12].map((s) => std({ name: 'facade', map: facadeTex(s), roughness: 0.7, color: 0xd9d4cc }));
  const mats = [...classic, ...modern];
  // city around the complex (world x, z, width, depth, floors)
  const blocks = [
    [-78, 0, 24, 40, 10], [-78, 55, 24, 40, 8], [-78, 110, 24, 40, 12], [105, 10, 24, 40, 9], [105, 65, 24, 40, 11],
    [20, 135, 70, 22, 9], [-60, -130, 34, 24, 8], [30, -140, 50, 24, 10], [110, -125, 40, 24, 7], [-110, -70, 28, 28, 6],
  ];
  // a ring of mid-distance blocks fills the view between the street and the skyline backdrop
  const RR = rand(91);
  for (let i = 0; i < 46; i++) {
    const a = (i / 46) * Math.PI * 2 + RR() * 0.08, r = 170 + RR() * 260;
    const x = 23 + Math.cos(a) * r, y = 40 + Math.sin(a) * r;
    blocks.push([x, y, 20 + RR() * 30, 18 + RR() * 26, Math.round(6 + RR() * (r > 300 ? 18 : 11))]);
  }
  root.userData.blocks = []; // the Showcase moves these out of the way
  blocks.forEach(([x, y, w, d, floors], i) => {
    const h = floors * 3.04 + 4.7;
    const m = new THREE.Mesh(blockGeo(w, h, d), mats[i % mats.length]);
    m.position.set(x, h / 2, y);
    m.castShadow = m.receiveShadow = true;
    root.add(m);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.8, 0.6, d + 0.8), std({ color: 0xeee2c8, roughness: 0.85 }));
    cap.position.set(x, h, y);
    root.add(cap);
    root.userData.blocks.push({ objs: [m, cap], boxes: [[x - w / 2, y - d / 2, x + w / 2, y + d / 2]], h: h + 1 });
  });
  root.add(buildBackdrop());
  return root;
}
