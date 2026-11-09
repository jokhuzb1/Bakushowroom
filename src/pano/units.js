// Which units have a 360° tour: every apartment on floors 1-2, and floor 1's commercial branch.
// The interior designs every tour is rendered in; a design's panoramas live in public/pano/<id>/<design>/
// (the first design directly in public/pano/<id>/). The branch has its one design (src/building/branch.js).
import { BRANCH } from '../building/branch.js';

export const DESIGNS = [{ id: 'classic', name: 'Warm minimal' }, { id: 'hitech', name: 'Hi-tech', exposure: -0.3 }];

export const panoId = (u) => `f${u.floor}-${u.number}`;
export const hasPano = (u) => u.kind === 'commercial' || (u.kind === 'apartment' && u.floor <= 2);

export function panoUnits(floors) {
  return floors.filter((f) => f.floor <= 2).flatMap((f) => f.units.filter(hasPano).map((u) => ({
    id: panoId(u),
    unit: u,
    title: u.kind === 'commercial' ? `${BRANCH.name} ${BRANCH.line}` : `Apartment ${u.code}`,
    subtitle: u.kind === 'commercial' ? `Floor ${u.floor} · commercial hall · ${u.area.toFixed(1)} m²` : `Floor ${u.floor} · plan №${u.number}${u.area ? ` · ${u.area.toFixed(1)} m²` : ''}`,
  })));
}
