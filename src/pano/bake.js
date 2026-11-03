// 360° bake, step 1 of 2: exports every show-flat on floors 1-2 and every shop as a glTF scene plus a
// JSON sidecar (lights, one camera per tour stop) for bake/render_blender.py to path-trace, and writes
// the tour data the viewer reads (public/pano/<id>/tour.json). Run with the dev server up:
//
//   /pano-bake.html                     everything
//   /pano-bake.html?units=f2-3,shop-evos only these
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { buildingMaterials } from '../building/materials.js';
import { buildBuilding } from '../building/model.js';
import { loadInteriorKit } from '../building/kit.js';
import { buildShowflat } from '../building/showflat.js';
import { buildShop } from '../building/shops.js';
import { tourStops } from './rooms.js';
import { panoUnits } from './units.js';

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
    if (o.isLight || (o.isMesh && o.material?.blending === THREE.AdditiveBlending)) drop.push(o);
    else if (o.type === 'Object3D' && !o.children.length) drop.push(o); // spot targets
  });
  drop.forEach((o) => o.parent?.remove(o));
}

// opening view: along the room's long axis, towards the windows when it has them
function lookFor(stop) {
  const q = stop.room.inner ?? stop.room.bbox;
  if (stop.type === 'shopFront') return [0, 1]; // shops: from the door into the shop, towards the counter
  if (stop.room.side === 'north') return [0, -1];
  if (stop.room.side === 'south') return [0, 1];
  const [x, y] = stop.plan, w = q[2] - q[0], d = q[3] - q[1];
  if (w > d) return [x < (q[0] + q[2]) / 2 ? 1 : -1, 0];
  return [0, y < (q[1] + q[3]) / 2 ? 1 : -1];
}

async function main() {
  log('Loading plans and materials…');
  const data = await (await fetch('/data/building.json')).json();
  const M = buildingMaterials();
  const B = buildBuilding(data, M);
  const K = await loadInteriorKit(M);
  const only = q.get('units')?.split(',');
  const list = panoUnits(B.floors).filter((p) => !only || only.includes(p.id));
  const exporter = new GLTFExporter();

  for (const [i, p] of list.entries()) {
    log(`[${i + 1}/${list.length}] Building ${p.id}…`);
    const f = B.floors[p.unit.floor - 1];
    const sf = p.unit.kind === 'shop' ? buildShop(p.unit.shop, K) : await buildShowflat({ ...f, sheetIndex: data.sheets.indexOf(f.sheet) }, p.unit, K, M.wall);
    const scene = new THREE.Scene();
    scene.add(sf.group);
    if (sf.lights) scene.add(sf.lights);
    const stops = tourStops(sf.rooms, sf.colliders, sf.sheet.walls);
    const lights = describeLights(scene);
    stripRealtime(scene);

    log(`[${i + 1}/${list.length}] Exporting ${p.id} (${lights.length} lights, ${stops.length} stops)…`);
    const glb = await exporter.parseAsync(scene, { binary: true, maxTextureSize: 2048 });
    await post(`bake/out/${p.id}.glb`, new Blob([glb]));
    await post(`bake/out/${p.id}.json`, JSON.stringify({
      variant: p.id, finish: p.unit.kind === 'shop' ? 'shop' : 'showflat', lights,
      rooms: stops.map((s) => ({ id: s.id, kind: s.type, cam: s.cam, output: `${p.id}/${s.id}` })),
    }, null, 1));

    // tour data for the viewer: stops, hotspots and a small plan (rooms + nearby walls)
    let b = [Infinity, Infinity, -Infinity, -Infinity];
    for (const r of sf.rooms) for (const x of r.rects) b = [Math.min(b[0], x[0]), Math.min(b[1], x[1]), Math.max(b[2], x[2]), Math.max(b[3], x[3])];
    const r2 = (v) => Math.round(v * 100) / 100, rr = (x) => x.map(r2);
    const walls = sf.sheet.walls.filter((w) => w[2] > b[0] - 0.4 && w[0] < b[2] + 0.4 && w[3] > b[1] - 0.4 && w[1] < b[3] + 0.4 && (w[2] - w[0]) * (w[3] - w[1]) > 0.003).map(rr);
    await post(`public/pano/${p.id}/tour.json`, JSON.stringify({
      id: p.id, title: p.title, subtitle: p.subtitle, bounds: rr(b), walls,
      stops: stops.map((s) => ({
        id: s.id, name: s.name, type: s.type, area: s.area, plan: rr(s.plan), look: lookFor(s),
        rects: s.parts.flatMap((o) => o.rects).map(rr),
        links: s.links.map((l) => ({ to: l.to, dir: l.dir.map((v) => +v.toFixed(4)) })),
      })),
    }));
  }
  log(`Exported ${list.length} scene(s) to bake/out/ and tour data to public/pano/.`);
  window.bakeDone = true;
}

main().catch((e) => { log('ERROR: ' + (e.stack || e)); window.bakeError = String(e); });
