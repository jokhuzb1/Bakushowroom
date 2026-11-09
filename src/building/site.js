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

// Foliage is a solid inner mass with hundreds of leaf cards around it: small quads carrying a cut-out spray of leaves,
// lit with normals pointing out of the crown so it shades softly as a whole, and tinted from the shaded underside to
// the sunlit top. The silhouette breaks up into leaves, as a real tree's does.
let leafTex;
function leafTexture() {
  if (leafTex) return leafTex;
  const S = 256, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d'), R = rand(31);
  g.clearRect(0, 0, S, S);
  // an opaque middle: the inner mass samples this spot
  g.fillStyle = '#b9c4a6';
  g.beginPath();
  g.arc(S / 2, S / 2, 26, 0, Math.PI * 2);
  g.fill();
  for (let i = 0; i < 95; i++) {
    const a = R() * Math.PI * 2, r = (0.12 + R() * 0.88) * S * 0.44, x = S / 2 + Math.cos(a) * r, y = S / 2 + Math.sin(a) * r, l = 15 + R() * 14;
    const v = 170 + R() * 85;
    g.fillStyle = `rgb(${v * 0.92}, ${v}, ${v * 0.8})`;
    g.save();
    g.translate(x, y);
    g.rotate(R() * Math.PI * 2);
    g.beginPath();
    g.ellipse(0, 0, l, l * 0.42, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  leafTex = new THREE.CanvasTexture(c);
  leafTex.colorSpace = THREE.SRGBColorSpace;
  leafTex.anisotropy = 8;
  return leafTex;
}
const BROADLEAF = { dark: new THREE.Color(0x1d3512), light: new THREE.Color(0x6b9a36) };
const CYPRESS = { dark: new THREE.Color(0x14240f), light: new THREE.Color(0x46662c) };
// cards: [{ at, out, size }] around a crown spanning heights y0..y1
function leafCards(cards, R, { dark, light }, y0, y1, upright = 0) {
  const n = cards.length, pos = new Float32Array(n * 12), nor = new Float32Array(n * 12), uv = new Float32Array(n * 8), col = new Float32Array(n * 12), idx = [];
  const face = new THREE.Vector3(), u = new THREE.Vector3(), v = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), c = new THREE.Color();
  const tint = 0.82 + R() * 0.34, warm = R() * 0.12;
  cards.forEach(({ at, out, size }, i) => {
    face.copy(out).add(new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).multiplyScalar(1.3)).normalize();
    u.crossVectors(Math.abs(face.y) > 0.92 ? new THREE.Vector3(1, 0, 0) : up, face).normalize();
    v.crossVectors(face, u).normalize();
    const spin = R() * Math.PI * 2 * (1 - upright), cs = Math.cos(spin), sn = Math.sin(spin);
    const ax = u.clone().multiplyScalar(cs).addScaledVector(v, sn).multiplyScalar(size / 2);
    const ay = u.clone().multiplyScalar(-sn).addScaledVector(v, cs).multiplyScalar(size / 2 * (1 + upright * 0.7));
    const t = Math.min(1, Math.max(0, (at.y - y0) / (y1 - y0)));
    c.copy(dark).lerp(light, t ** 0.85 * (0.72 + R() * 0.28)).multiplyScalar(tint);
    c.r += warm * 0.1;
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([s, w], k) => {
      pos.set([at.x + ax.x * s + ay.x * w, at.y + ax.y * s + ay.y * w, at.z + ax.z * s + ay.z * w], (i * 4 + k) * 3);
      nor.set([out.x, out.y, out.z], (i * 4 + k) * 3);
      uv.set([(s + 1) / 2, (w + 1) / 2], (i * 4 + k) * 2);
      col.set([c.r, c.g, c.b], (i * 4 + k) * 3);
    });
    const b = i * 4;
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(idx);
  return geo;
}
// the solid mass inside a crown, in the leaf colours; all its uvs on the texture's opaque middle
function innerMass(geo, { dark, light }, mid = 0.42) {
  const n = geo.attributes.position.count, col = new Float32Array(n * 3), uv = geo.attributes.uv;
  const c = dark.clone().lerp(light, mid);
  for (let i = 0; i < n; i++) { col.set([c.r, c.g, c.b], i * 3); uv.setXY(i, 0.5, 0.5); }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}
// a broadleaf crown of a few overlapping lobes
function canopy(R, s) {
  const lobes = [], cards = [], n = 3 + Math.floor(R() * 3);
  const centre = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const r = s * (0.55 + R() * 0.25), a = R() * Math.PI * 2, off = i === 0 ? 0 : s * 0.45;
    centre.set(Math.cos(a) * off, (R() - 0.3) * s * 0.4, Math.sin(a) * off);
    lobes.push(innerMass(new THREE.IcosahedronGeometry(r * 0.66, 1), BROADLEAF).translate(centre.x, centre.y, centre.z));
    for (let k = 0; k < 120; k++) {
      const y = R() * 1.7 - 0.7, ca = R() * Math.PI * 2, ring = Math.sqrt(Math.max(0, 1 - y * y));
      const out = new THREE.Vector3(Math.cos(ca) * ring, y, Math.sin(ca) * ring);
      cards.push({ at: out.clone().multiplyScalar(r * (0.74 + R() * 0.3)).add(centre), out, size: 0.62 + R() * 0.45 });
    }
  }
  const geo = mergeGeometries([...lobes.map((g) => g.toNonIndexed()), leafCards(cards, R, BROADLEAF, -s, s).toNonIndexed()]);
  return geo;
}
// a slim Italian cypress: tight upright sprays around a pointed flame
function cypress(R, h) {
  const radius = (t) => 0.62 * Math.sin(Math.PI * Math.min(1, t * 1.15)) ** 0.7 * (1 - t * 0.55) + 0.01;
  const pts = [], cards = [];
  for (let i = 0; i <= 10; i++) pts.push(new THREE.Vector2(radius(i / 10) * 0.68, (i / 10 - 0.5) * h));
  for (let k = 0; k < 300; k++) {
    const t = R() ** 0.85, a = R() * Math.PI * 2;
    const out = new THREE.Vector3(Math.cos(a), 0.25, Math.sin(a)).normalize();
    cards.push({ at: new THREE.Vector3(Math.cos(a) * radius(t) * (0.9 + R() * 0.28), (t - 0.5) * h, Math.sin(a) * radius(t) * (0.9 + R() * 0.28)), out, size: 0.24 + R() * 0.16 });
  }
  return mergeGeometries([innerMass(new THREE.LatheGeometry(pts, 8), CYPRESS).toNonIndexed(), leafCards(cards, R, CYPRESS, -h / 2, h / 2, 0.8).toNonIndexed()]);
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
    const trunkH = 2.4 + s * 0.7;
    trunks.push(new THREE.CylinderGeometry(0.06, 0.13, trunkH, 7).translate(x, trunkH / 2, z));
    for (let l = 0; l < 4; l++) {
      // limbs leaving the trunk upwards and outwards, into the crown
      const a = R() * Math.PI * 2, len = s * (0.7 + R() * 0.4), tilt = 0.55 + R() * 0.45, from = 1.9 + R() * 0.9;
      const dir = new THREE.Vector3(Math.cos(a) * Math.sin(tilt), Math.cos(tilt), Math.sin(a) * Math.sin(tilt));
      const limb = new THREE.CylinderGeometry(0.018, 0.05, len, 5).translate(0, len / 2, 0);
      limb.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
      trunks.push(limb.translate(x, from, z));
    }
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
    return m;
  };
  const leaves = std({ vertexColors: true, map: leafTexture(), alphaTest: 0.42, roughness: 0.82, side: THREE.DoubleSide });
  // (the occlusion pass ignores cut-outs: it would see every card as a solid square)
  add(cyp, leaves).userData.noAO = true;
  add(round, leaves).userData.noAO = true;
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
