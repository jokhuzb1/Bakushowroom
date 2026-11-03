import { SHOPS, SHOP_Y0, SHOP_Y1 } from './shops.js';

// Building levels and apartment boundaries, read from the "Baku City" 16-floor drawings (sheets 3-10).
// Plan coordinates in meters: x east from grid axis 1, y south from grid axis И (north facade line).

// Section A-A: floor 1 is 4.74 m (retail), floor 2 is 3.34 m, floors 3-16 are 3.04 m; roof slab at +50.64.
export function levels() {
  const out = [];
  let z = 0;
  for (let f = 1; f <= 16; f++) {
    const h = f === 1 ? 4.74 : f === 2 ? 3.34 : 3.04;
    out.push({ floor: f, z, h });
    z += h;
  }
  return out;
}
export const ROOF_Z = 50.64;

// Which drawing sheet describes each floor (matches tools/extract_plan.py SHEETS order).
export function sheetIndexFor(floor) {
  if (floor === 1) return 0;
  if (floor === 2) return 1;
  if (floor === 3) return 2;
  if (floor <= 5) return 3;
  if (floor <= 10) return 4;
  return 5;
}

// Apartment footprints by plan number (the "№" on the drawings), as unions of rectangles [x0, y0, x1, y1].
// North flats on floors 2-3 run out over the retail podium roof (terraces to axis К, y = -4.4).
const TYPICAL = {
  3: [[0, 0, 9.4, 8.0]],
  4: [[9.4, 0, 15.8, 8.0]],
  5: [[15.8, 0, 22.6, 8.0]],
  6: [[22.6, 0, 28.8, 8.0]],
  7: [[28.8, 0, 35, 8.0], [29.4, 8.0, 35, 10.2]],
  2: [[0, 10.2, 6.2, 18.2], [0, 8.0, 5.85, 10.2]],
  1: [[6.2, 10.2, 12.4, 18.2]],
  9: [[19.4, 10.2, 25.6, 18.2]],
  8: [[25.6, 10.2, 35, 18.2]],
};
const PODIUM = Object.fromEntries(Object.entries(TYPICAL).map(([n, rects]) => [n, rects.map((r) => (r[1] === 0 ? [r[0], -4.4, r[2], r[3]] : r))]));
const GROUND = {
  2: TYPICAL[2],
  1: TYPICAL[1],
  4: [[19.4, 10.2, 25.6, 18.2]],
  3: [[25.6, 10.2, 35, 18.2], [29.4, 8.0, 35, 10.2]],
};

export function unitsForFloor(floor, sheet) {
  const map = floor === 1 ? GROUND : floor <= 3 ? PODIUM : TYPICAL;
  const tags = Object.fromEntries((sheet?.units ?? []).map((t) => [t.type, t]));
  const units = Object.entries(map).map(([n, rects]) => {
    const tag = tags[n] ?? {};
    return {
      id: `${floor}-${n}`,
      floor,
      number: +n,
      code: `${floor}${String(n).padStart(2, '0')}`,
      rooms: tag.rooms ?? null,
      area: tag.area ?? null,
      rects,
      kind: 'apartment',
    };
  });
  // the retail podium is let as separate shops (see shops.js)
  if (floor === 1) for (const s of SHOPS) {
    units.push({ id: `shop-${s.slug}`, floor, number: 100 + SHOPS.indexOf(s), code: s.brand, rooms: null, area: +((s.x1 - s.x0) * (SHOP_Y1 - SHOP_Y0)).toFixed(1), rects: [[s.x0, SHOP_Y0, s.x1, SHOP_Y1]], kind: 'shop', shop: s });
  }
  return units;
}
