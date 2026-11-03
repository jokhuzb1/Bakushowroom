// Which units have a 360° tour: every apartment on floors 1-2 and every ground-floor shop.
import { shopKindLabel } from '../building/shops.js';

export const panoId = (u) => (u.kind === 'shop' ? u.id : `f${u.floor}-${u.number}`);
export const hasPano = (u) => u.kind === 'shop' || (u.kind === 'apartment' && u.floor <= 2);

export function panoUnits(floors) {
  return floors.slice(0, 2).flatMap((f) => f.units.filter(hasPano).map((u) => ({
    id: panoId(u),
    unit: u,
    title: u.kind === 'shop' ? u.shop.brand : `Apartment ${u.code}`,
    subtitle: u.kind === 'shop' ? `${shopKindLabel(u.shop)} · ${u.shop.tagline}` : `Floor ${u.floor} · plan №${u.number}${u.area ? ` · ${u.area.toFixed(1)} m²` : ''}`,
  })));
}
