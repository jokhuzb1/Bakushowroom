// The plot around the tower: boulevard on the shop side, sidewalks, cypress trees, street lamps
// and low-detail neighbouring blocks in the same cream stone.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rand } from '../textures.js';
import { CX, CY } from './model.js';
import { facadeTexture } from './complex.js';
import { buildBackdrop } from './backdrop.js';

const X = (x) => x - CX, Z = (y) => y - CY;

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

export function buildSite() {
  const root = new THREE.Group();
  const std = (p) => new THREE.MeshStandardMaterial(p);
  const asphalt = std({ color: 0x55575a, roughness: 0.95 });
  const paving = std({ color: 0xb9b2a6, roughness: 0.9 });
  const grass = std({ color: 0x6c8650, roughness: 1 });
  const paint = std({ color: 0xe8e6df, roughness: 0.8 });

  const plane = (w, d, mat, x, y, z) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), mat);
    m.position.set(x, y, z);
    m.receiveShadow = true;
    root.add(m);
    return m;
  };
  plane(900, 900, grass, 0, -0.06, 0);
  // the complex plot (world coordinates: block 3A at the origin, shops facing -z)
  plane(110, 124, paving, 23, -0.03, 42);
  // courtyard lawns and the garden between 3A and the corner block
  plane(36, 22, grass, 22, -0.02, 57).position.y = -0.015;
  plane(9.5, 13, grass, 23.8, -0.015, -0.5);
  plane(20, 9, grass, -3, -0.015, 15.5);
  // boulevard in front of the shops and the wide avenue along the -x side (as in the aerials)
  plane(500, 16, asphalt, 0, -0.02, -25.1);
  plane(22, 500, asphalt, -40, -0.02, 40);
  const marks = [];
  for (let x = -180; x < 180; x += 6) marks.push(new THREE.PlaneGeometry(3, 0.15).rotateX(-Math.PI / 2).translate(x, 0, 0));
  const lane = new THREE.Mesh(mergeGeometries(marks), paint);
  lane.position.set(X(17.5), -0.01, Z(-16.0));
  root.add(lane);
  // parking bays along the boulevard
  const bays = [];
  for (let x = -2; x <= 82; x += 2.6) if (x < 35.5 || x > 47) bays.push(new THREE.PlaneGeometry(0.12, 5).rotateX(-Math.PI / 2).translate(X(x), 0, 0));
  const bayMesh = new THREE.Mesh(mergeGeometries(bays), paint);
  bayMesh.position.set(0, -0.01, Z(-10.5));
  root.add(bayMesh);

  // cypress trees and lamp posts along the shop front
  const R = rand(77);
  const cyp = [], trunks = [], poles = [], lamps = [];
  const cone = new THREE.ConeGeometry(0.55, 1, 10);
  for (let x = 1.6; x < 82; x += 3.2) {
    if (x > 35 && x < 47.5) continue; // garden opening
    const h = 4.2 + R() * 1.4;
    cyp.push(cone.clone().scale(1, h, 1).translate(X(x), 0.4 + h / 2, Z(-8.2)));
    trunks.push(new THREE.CylinderGeometry(0.08, 0.1, 0.5, 6).translate(X(x), 0.25, Z(-8.2)));
  }
  for (let x = -1; x < 82; x += 6.4) {
    poles.push(new THREE.CylinderGeometry(0.05, 0.07, 4.2, 8).translate(X(x), 2.1, Z(-8.9)));
    lamps.push(new THREE.SphereGeometry(0.17, 12, 8).translate(X(x), 4.3, Z(-8.9)));
  }
  // courtyard trees (world coordinates) and along the avenue
  const round = [];
  const spots = [];
  for (let i = 0; i < 26; i++) spots.push([6 + R() * 34, 46 + R() * 22]);
  for (let i = 0; i < 8; i++) spots.push([2 + R() * 30, 12 + R() * 6]);
  for (let z = -12; z < 100; z += 7) spots.push([-27, z]);
  for (const [x, z] of spots) {
    const s = 1.5 + R() * 1.2;
    round.push(new THREE.IcosahedronGeometry(s, 1).translate(x, 2.4 + s, z));
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
  add(cyp, std({ color: 0x2f4b2a, roughness: 0.9, flatShading: true }));
  add(round, std({ color: 0x4d6a3b, roughness: 0.9, flatShading: true }));
  add(trunks, std({ color: 0x4a3a2c, roughness: 1 }));
  add(poles, std({ color: 0x1f1f1f, metalness: 0.5, roughness: 0.5 }));
  add(lamps, std({ color: 0xfff3dc, emissive: 0xffe2b0, emissiveIntensity: 0.8 }));
  add(gaz, std({ color: 0xeee2c8, roughness: 0.8 }));
  add(gazRoof, std({ color: 0x9a3b2c, metalness: 0.3, roughness: 0.45 }));

  // neighbouring blocks (the U-shaped site plan): cream towers with a window texture
  // neighbours in the same classical stone language as the complex, plus a few plainer modern blocks
  const classic = [0, 1, 2].map((v) => std({ map: facadeTexture(v), roughness: 0.85 }));
  const modern = [11, 12].map((s) => std({ map: facadeTex(s), roughness: 0.7, color: 0xd9d4cc }));
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
  blocks.forEach(([x, y, w, d, floors], i) => {
    const h = floors * 3.04 + 4.7;
    const m = new THREE.Mesh(blockGeo(w, h, d), mats[i % mats.length]);
    m.position.set(x, h / 2, y);
    m.castShadow = m.receiveShadow = true;
    root.add(m);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.8, 0.6, d + 0.8), std({ color: 0xeee2c8, roughness: 0.85 }));
    cap.position.set(x, h, y);
    root.add(cap);
  });
  root.add(buildBackdrop());
  return root;
}
