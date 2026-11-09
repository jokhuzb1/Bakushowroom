// 360° bake, step 1 of 2: exports every show-flat on floors 1-2 as a glTF scene plus a
// JSON sidecar (lights, one camera per tour stop) for bake/render_blender.py to path-trace, and writes
// the tour data the viewer reads (public/pano/<id>/tour.json). Run with the dev server up:
//
//   /pano-bake.html                     everything
//   /pano-bake.html?units=f2-3,f1-1 only these
//   /pano-bake.html?designs=hitech  only this design (classic, hitech; classic also writes the tour data)
//   /pano-bake.html?units=exterior  only the outside of the building: 4K stills and a 360° tour
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { buildingMaterials } from '../building/materials.js';
import { buildBuilding } from '../building/model.js';
import { loadInteriorKit } from '../building/kit.js';
import { loadModels, HITECH_IDS } from '../building/models.js';
import { buildShowflat } from '../building/showflat.js';
import { buildBranch, loadBranchModels } from '../building/branch.js';
import { buildSite, STREET_VIEWS } from '../building/site.js';
import { buildComplex, BLOCKS } from '../building/complex.js';
import { CX, CY } from '../building/model.js';
import { tourStops } from './rooms.js';
import { panoUnits, DESIGNS } from './units.js';

const q = new URLSearchParams(location.search);
const status = document.getElementById('status');
const log = (s) => { status.textContent = s; console.log(s); };

async function post(file, body) {
  const res = await fetch(`/__pano?file=${encodeURIComponent(file)}`, { method: 'POST', body });
  if (!res.ok) throw new Error(`save ${file} failed: ${await res.text()}`);
}

// three.js lights -> Cycles lights. Real-time intensities are tuned for the 3D view; Cycles gets the
// power a lighting designer would specify (W), set on the light or derived from the intensity.
function describeLights(root) {
  const out = [], v = new THREE.Vector3(), t = new THREE.Vector3();
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!o.isLight) return;
    // warm real-time light colours turn orange under AgX: Cycles gets them halfway to white (~3500 K)
    const pos = o.getWorldPosition(v).toArray(), color = o.color.clone().lerp(new THREE.Color(1, 1, 1), 0.5).toArray();
    if (o.isSpotLight) out.push({ type: 'spot', pos, target: o.target.getWorldPosition(t).toArray(), color, watts: o.userData.watts ?? o.intensity * 6, angle: o.angle, blend: o.penumbra, radius: 0.04 });
    else if (o.isPointLight) out.push({ type: 'point', pos, color, watts: o.userData.watts ?? o.intensity * 14, radius: 0.08 });
    else if (o.isDirectionalLight) out.push({ type: 'sun', toSun: o.position.clone().sub(o.target.position).normalize().toArray(), color: o.color.toArray(), strength: o.userData.strength ?? 3 });
  });
  return out;
}

// what the path tracer should not see: real-time lights and the additive glow decals that fake them.
// Real-time materials tuned to look right without global illumination are adjusted for it here.
let satinParquet, paint;
function stripRealtime(root) {
  const drop = [];
  root.traverse((o) => {
    if (o.isMesh && o.material?.name === 'plaster') {
      // the scanned plaster is brightened by a colour above 1, which glTF clamps (walls came out tan):
      // export a soft off-white paint that keeps the plaster's relief
      paint ??= Object.assign(o.material.clone(), { map: null, color: new THREE.Color(0xeeeae4) });
      o.material = paint;
    }
    if (o.isMesh && o.material?.name === 'parquet') {
      // path-traced, the glossy parquet reads as a wet floor: matte it down to an oiled satin
      satinParquet ??= Object.assign(o.material.clone(), { roughnessMap: null, roughness: 0.62, color: new THREE.Color(0xc4beb6) });
      o.material = satinParquet;
    }
    // (and the invisible boxes the showroom picks floors with)
    if (o.isLight || (o.isMesh && (o.material?.blending === THREE.AdditiveBlending || o.material?.visible === false))) drop.push(o);
    else if (o.type === 'Object3D' && !o.children.length) drop.push(o); // spot targets
  });
  drop.forEach((o) => o.parent?.remove(o));
}

// opening view: along the room's long axis, towards the windows when it has them
function lookFor(stop) {
  if (stop.room.look) return stop.room.look;
  const q = stop.room.inner ?? stop.room.bbox;
  if (stop.room.side === 'north') return [0, -1];
  if (stop.room.side === 'south') return [0, 1];
  const [x, y] = stop.plan, w = q[2] - q[0], d = q[3] - q[1];
  if (w > d) return [x < (q[0] + q[2]) / 2 ? 1 : -1, 0];
  return [0, y < (q[1] + q[3]) / 2 ? 1 : -1];
}

// The outside of the building in daylight: the whole complex with the same sun as the 3D view's "Day".
// [x, y, z] in world coordinates (3A at the origin, street front towards -z).
const EXTERIOR_STOPS = [
  ...STREET_VIEWS,
  { id: 'garden', name: 'Garden', pos: [23.8, 1.6, 0.5], look: [0, 12, 0] },
  { id: 'courtyard', kind: 'courtyard', name: 'Courtyard', pos: [22, 1.6, 44], look: [10, 15, 31] },
  { id: 'aerial', name: 'From the air', pos: [-46, 62, -66], look: [0, 25, 0] },
];
const EXTERIOR_STILLS = [
  { id: 'front', pos: [-38, 11, -76], look: [3, 27, -6], lens: 24 },
  { id: 'corner', pos: [56, 8, -66], look: [6, 27, -8], lens: 22 },
  { id: 'aerial', pos: [-92, 78, -104], look: [18, 8, 22], lens: 32 },
  { id: 'street', pos: [23.7, 1.6, -31], look: [-3, 14, -12], lens: 16 },
  { id: 'garden', pos: [24, 1.6, -15], look: [24, 5.5, 6], lens: 20 },
];
async function exportExterior(B, exporter) {
  log('Building the exterior…');
  const scene = new THREE.Scene();
  scene.add(B.root, buildSite(), buildComplex());
  const sun = new THREE.DirectionalLight(0xfff0dc, 1);
  sun.position.set(-0.6, 0.55, -0.6);
  sun.userData.strength = 3.2;
  scene.add(sun);
  const lights = describeLights(scene);
  stripRealtime(scene);
  log('Exporting the exterior…');
  const glb = await exporter.parseAsync(scene, { binary: true, maxTextureSize: 2048 });
  await post('bake/out/exterior.glb', new Blob([glb]));
  await post('bake/out/exterior.json', JSON.stringify({
    variant: 'exterior', exterior: true, finish: 'exterior', lights,
    rooms: EXTERIOR_STOPS.map((v) => ({ id: v.id, kind: v.kind ?? 'street', cam: v.pos, output: `exterior/${v.id}` })),
    stills: EXTERIOR_STILLS.map((v) => ({ ...v, output: `renders/${v.id}` })),
  }, null, 1));
  // tour: plan coordinates for the mini map; hotspots point at the other stops' spots on the ground
  const plan = (p) => [+(p[0] + CX).toFixed(2), +(p[2] + CY).toFixed(2)];
  const stops = EXTERIOR_STOPS.map((v) => {
    const [x, y] = plan(v.pos), d = [v.look[0] - v.pos[0], v.look[2] - v.pos[2]], n = Math.hypot(...d);
    return {
      id: v.id, name: v.name, type: 'street', area: null, plan: [x, y], look: [d[0] / n, d[1] / n], rects: [[x - 2, y - 2, x + 2, y + 2]],
      links: EXTERIOR_STOPS.filter((o) => o !== v).map((o) => {
        const dir = [o.pos[0] - v.pos[0], (v.id === 'aerial' ? 0 : o.id === 'aerial' ? 40 : 0.2) - v.pos[1], o.pos[2] - v.pos[2]], m = Math.hypot(...dir);
        return { to: o.id, dir: dir.map((c) => +(c / m).toFixed(4)) };
      }),
    };
  });
  // the buildings' outlines are the map's walls
  const outline = ([x0, y0, x1, y1]) => [[x0, y0, x1, y0 + 0.5], [x0, y1 - 0.5, x1, y1], [x0, y0, x0 + 0.5, y1], [x1 - 0.5, y0, x1, y1]];
  const rects = [[0, -8.82, 35, 18.3], ...BLOCKS.flatMap((b) => b.rects.map(([a, c, e, f]) => [a + CX, c + CY, e + CX, f + CY]))];
  await post('public/pano/exterior/tour.json', JSON.stringify({
    id: 'exterior', title: 'Baku City', subtitle: 'The building and its surroundings', bounds: [-70, -90, 95, 115], walls: rects.flatMap(outline), designs: [], stops,
  }));
}

async function main() {
  log('Loading plans and materials…');
  const data = await (await fetch('/data/building.json')).json();
  const M = buildingMaterials();
  const B = buildBuilding(data, M);
  const K = await loadInteriorKit(M);
  Object.assign(K.lib, await loadModels(null, HITECH_IDS));
  await loadBranchModels(K);
  const only = q.get('units')?.split(',');
  const designs = DESIGNS.filter((d) => !q.get('designs') || q.get('designs').split(',').includes(d.id));
  const list = panoUnits(B.floors).filter((p) => !only || only.includes(p.id));
  const exporter = new GLTFExporter();

  for (const [i, p] of list.entries()) {
    const f = B.floors.find((x) => x.floor === p.unit.floor);
    const branch = p.unit.kind === 'commercial';
    for (const design of designs) {
      if (branch && design.id !== 'classic') continue;
      log(`[${i + 1}/${list.length}] Building ${p.id} (${design.id})…`);
      const sf = branch ? buildBranch(f, K) : await buildShowflat({ ...f, sheetIndex: data.sheets.indexOf(f.sheet) }, p.unit, K, M.wall, design.id);
      const scene = new THREE.Scene();
      scene.add(sf.group);
      if (sf.lights) scene.add(sf.lights);
      if (sf.bakeLights) scene.add(sf.bakeLights);
      if (branch) scene.add(buildSite(), buildComplex()); // the shopfront looks out on the real street, under a plain sky
      // every design has the same layout and so the same stops: a tour switches design without moving
      const stops = tourStops(sf.rooms, sf.colliders, sf.sheet.walls);
      const lights = describeLights(scene);
      stripRealtime(scene);

      const name = design.id === 'classic' ? p.id : `${p.id}--${design.id}`, dir = design.id === 'classic' ? p.id : `${p.id}/${design.id}`;
      log(`[${i + 1}/${list.length}] Exporting ${name} (${lights.length} lights, ${stops.length} stops)…`);
      const glb = await exporter.parseAsync(scene, { binary: true, maxTextureSize: 2048 });
      await post(`bake/out/${name}.glb`, new Blob([glb]));
      await post(`bake/out/${name}.json`, JSON.stringify({
        variant: p.id, design: design.id, exposure: design.exposure ?? 0, finish: 'showflat', exterior: branch, lights,
        rooms: stops.map((s) => ({ id: s.id, kind: s.type, cam: s.cam, output: `${dir}/${s.id}` })),
      }, null, 1));
      if (design.id !== 'classic') continue;

      // tour data for the viewer: stops, hotspots and a small plan (rooms + nearby walls)
      let b = [Infinity, Infinity, -Infinity, -Infinity];
      for (const r of sf.rooms) for (const x of r.rects) b = [Math.min(b[0], x[0]), Math.min(b[1], x[1]), Math.max(b[2], x[2]), Math.max(b[3], x[3])];
      const r2 = (v) => Math.round(v * 100) / 100, rr = (x) => x.map(r2);
      const walls = sf.sheet.walls.filter((w) => w[2] > b[0] - 0.4 && w[0] < b[2] + 0.4 && w[3] > b[1] - 0.4 && w[1] < b[3] + 0.4 && (w[2] - w[0]) * (w[3] - w[1]) > 0.003).map(rr);
      await post(`public/pano/${p.id}/tour.json`, JSON.stringify({
        id: p.id, title: p.title, subtitle: p.subtitle, bounds: rr(b), walls, designs: branch ? [] : DESIGNS,
        stops: stops.map((s) => ({
          id: s.id, name: s.name, type: s.type, area: s.area, plan: rr(s.plan), look: lookFor(s),
          rects: s.parts.flatMap((o) => o.rects).map(rr),
          links: s.links.map((l) => ({ to: l.to, dir: l.dir.map((v) => +v.toFixed(4)) })),
        })),
      }));
    }
  }
  if (!only || only.includes('exterior')) await exportExterior(B, exporter);
  log(`Exported ${list.length} scene(s) to bake/out/ and tour data to public/pano/.`);
  window.bakeDone = true;
}

main().catch((e) => { log('ERROR: ' + (e.stack || e)); window.bakeError = String(e); });
