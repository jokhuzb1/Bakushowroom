"""
Extract building geometry from vector CAD floor-plan PDFs.

Usage: python -I tools/extract_plan.py input/plan.pdf public/data/building.json

Per floor-plan page it:
  1. calibrates the drawing scale from the structural grid labels (axes 1..15 and А..И),
  2. re-draws only the wall / window / balcony layers onto blank pages and rasterizes them (2 cm per pixel),
  3. turns wall pixels into axis-aligned boxes, finds openings (gaps bridged along walls),
     classifies them as interior doorways, windows or balcony doors, and collects balcony slabs,
  4. reads apartment tags ("№3 (3х)", "68.69m2"); apartment boundaries live in src/building/units.js.
Coordinates: meters, x east from axis 1, y south from axis И (y=0 is the north facade line).
"""
import json
import re
import sys

import numpy as np
import pymupdf
from scipy import ndimage as ndi

PX_PER_M = 50  # 2 cm resolution
CROP = (-2.0, -6.0, 37.0, 21.0)  # meters: x0, y0, x1, y1

GRID_X = {'1': 0.0, '15': 35.0}
GRID_Y = {'И': 0.0, 'А': 18.2}

# which sheet describes which floors (from the sheet titles)
SHEETS = [
    {'page': 3, 'floors': [1], 'name': 'Floor 1 (retail + apartments)', 'height': 4.74},
    {'page': 4, 'floors': [2], 'name': 'Floor 2', 'height': 3.34},
    {'page': 5, 'floors': [3], 'name': 'Floor 3', 'height': 3.04},
    {'page': 6, 'floors': [4, 5], 'name': 'Typical floors 4-5', 'height': 3.04},
    {'page': 7, 'floors': list(range(6, 11)), 'name': 'Typical floors 6-10', 'height': 3.04},
    {'page': 8, 'floors': list(range(11, 17)), 'name': 'Typical floors 11-16', 'height': 3.04},
]


def rgb(c):
    return tuple(round(v, 2) for v in c) if c else None


def calibrate(page):
    xs, ys = {}, {}
    for b in page.get_text('dict')['blocks']:
        for line in b.get('lines', []):
            for s in line['spans']:
                t = s['text'].strip()
                if s['size'] < 12:
                    continue
                cx, cy = (s['bbox'][0] + s['bbox'][2]) / 2, (s['bbox'][1] + s['bbox'][3]) / 2
                if t in GRID_X:
                    xs[t] = cx
                if t in GRID_Y:
                    ys[t] = cy
    sx = (xs['15'] - xs['1']) / 35.0
    sy = (ys['А'] - ys['И']) / 18.2
    return {'x0': xs['1'], 'y0': ys['И'], 'sx': sx, 'sy': sy}


def layer_masks(page, cal):
    """Rasterize selected drawing layers into boolean masks over the crop window."""
    layers = {
        'rc': lambda g: g.get('fill') is not None and max(g['fill']) < 0.05,
        'block': lambda g: rgb(g.get('color')) == (0.0, 0.58, 0.44) or rgb(g.get('fill')) == (0.0, 0.58, 0.44),
        'glass': lambda g: rgb(g.get('color')) == (0.0, 0.5, 1.0),
        'balcony': lambda g: rgb(g.get('color')) == (1.0, 0.0, 1.0) or rgb(g.get('fill')) == (1.0, 0.0, 1.0),
        'fixture': lambda g: rgb(g.get('color')) in ((0.5, 0.5, 0.5), (0.58, 0.58, 0.6)),
        'door': lambda g: rgb(g.get('color')) == (0.72, 0.0, 0.18),
    }
    drawings = page.get_drawings()
    zoom = PX_PER_M / cal['sx']
    x0, y0, x1, y1 = CROP
    clip = pymupdf.Rect(cal['x0'] + x0 * cal['sx'], cal['y0'] + y0 * cal['sy'], cal['x0'] + x1 * cal['sx'], cal['y0'] + y1 * cal['sy'])
    clip &= page.rect  # the crop is clamped to the sheet; remember where it really starts
    origin = ((clip.x0 - cal['x0']) / cal['sx'], (clip.y0 - cal['y0']) / cal['sy'])
    masks = {}
    for name, sel in layers.items():
        doc = pymupdf.open()
        pg = doc.new_page(width=page.rect.width, height=page.rect.height)
        sh = pg.new_shape()
        for g in drawings:
            if not sel(g):
                continue
            for it in g['items']:
                if it[0] == 'l':
                    sh.draw_line(it[1], it[2])
                elif it[0] == 're':
                    sh.draw_rect(it[1])
                elif it[0] == 'qu':
                    sh.draw_quad(it[1])
                elif it[0] == 'c':
                    sh.draw_bezier(it[1], it[2], it[3], it[4])
            filled = g.get('fill') is not None
            sh.finish(color=(0, 0, 0), fill=(0, 0, 0) if filled else None, width=max(g.get('width') or 0.5, 0.5), closePath=filled)
        sh.commit()
        pix = pg.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), clip=clip, colorspace=pymupdf.csGRAY)
        a = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width)
        masks[name] = a < 128
    return masks, origin


def rects_from_mask(mask, min_px=2):
    """Greedy decomposition of a boolean mask into axis-aligned rectangles (pixel coords)."""
    h, w = mask.shape
    used = np.zeros_like(mask)
    rects = []
    for y in range(h):
        row = mask[y] & ~used[y]
        if not row.any():
            continue
        xs = np.flatnonzero(np.diff(np.concatenate(([0], row.view(np.int8), [0]))))
        for a, b in zip(xs[::2], xs[1::2]):
            if used[y, a]:
                continue
            # extend downward while the full run stays filled
            y2 = y + 1
            while y2 < h and mask[y2, a:b].all() and not used[y2, a:b].any():
                y2 += 1
            used[y:y2, a:b] = True
            if (b - a) >= min_px and (y2 - y) >= min_px:
                rects.append((a, y, b, y2))
    return rects


def largest_rect(mask):
    """Largest axis-aligned rectangle of True cells (histogram method). Returns (x0, y0, x1, y1) in px."""
    h, w = mask.shape
    heights = np.zeros(w, dtype=np.int32)
    best, out = 0, (0, 0, 0, 0)
    for y in range(h):
        heights = np.where(mask[y], heights + 1, 0)
        stack = []
        for x in range(w + 1):
            cur = heights[x] if x < w else 0
            start = x
            while stack and stack[-1][1] >= cur:
                sx, sh = stack.pop()
                area = sh * (x - sx)
                if area > best:
                    best, out = area, (sx, y - sh + 1, x, y + 1)
                start = sx
            stack.append((start, cur))
    return out


def to_m(r, org):
    x0, y0 = org
    return [round(x0 + r[0] / PX_PER_M, 3), round(y0 + r[1] / PX_PER_M, 3), round(x0 + r[2] / PX_PER_M, 3), round(y0 + r[3] / PX_PER_M, 3)]


def unit_tags(page, cal):
    tags = []
    spans = []
    for b in page.get_text('dict')['blocks']:
        for line in b.get('lines', []):
            spans.append({'text': ''.join(s['text'] for s in line['spans']), 'bbox': line['bbox']})
    for s in spans:
        t = s['text'].strip()
        m = re.match(r'№\s*(\d+)\s*\((\d)\s*[xх]\)', t)
        if not m:
            continue
        cx, cy = (s['bbox'][0] + s['bbox'][2]) / 2, (s['bbox'][1] + s['bbox'][3]) / 2
        # area label sits just above the number inside the same red tag
        area = None
        best = 1e9
        for o in spans:
            mt = re.match(r'([\d.]+)m2', o['text'].strip())
            if not mt:
                continue
            ox, oy = (o['bbox'][0] + o['bbox'][2]) / 2, (o['bbox'][1] + o['bbox'][3]) / 2
            d = abs(ox - cx) + abs(oy - cy)
            if d < best and d < 30:
                best, area = d, float(mt.group(1))
        tags.append({
            'type': int(m.group(1)), 'rooms': int(m.group(2)), 'area': area,
            'x': round((cx - cal['x0']) / cal['sx'], 2), 'y': round((cy - cal['y0']) / cal['sy'], 2),
        })
    return tags


def room_labels(page, cal):
    """Room area labels ("24,86") inside the plan, as points in meters."""
    out = []
    for b in page.get_text('dict')['blocks']:
        for line in b.get('lines', []):
            t = ''.join(s['text'] for s in line['spans']).strip()
            if re.fullmatch(r'\d{1,3},\d{2}', t):
                bb = line['bbox']
                out.append({'area': float(t.replace(',', '.')),
                            'x': ((bb[0] + bb[2]) / 2 - cal['x0']) / cal['sx'],
                            'y': ((bb[1] + bb[3]) / 2 - cal['y0']) / cal['sy']})
    return out


def extract_rooms(walls, footprint, org, labels, fixture_mask, door_mask):
    """Rooms = free space bounded by walls and door symbols (leaf + swing arc close each doorway).
    Every area label claims the region it sits in; regions holding two labels (rooms joined by an
    open arch) are split between them by distance. Door swings are returned as keep-clear zones."""
    to_px = lambda x, y: (int((y - org[1]) * PX_PER_M), int((x - org[0]) * PX_PER_M))
    doors = ndi.binary_dilation(door_mask, np.ones((3, 3)))
    space = footprint & ~walls & ~doors
    regions, _ = ndi.label(space)
    seeds = []
    for lab in labels:
        r, c = to_px(lab['x'], lab['y'])
        if not (0 <= r < regions.shape[0] and 0 <= c < regions.shape[1]):
            continue
        k = regions[r, c]
        if not k:
            win = regions[max(0, r - 20):r + 20, max(0, c - 20):c + 20]
            vals = win[win > 0]
            if not len(vals):
                continue
            k = int(np.bincount(vals).argmax())
        seeds.append((int(k), r, c, lab))
    by_region = {}
    for sd in seeds:
        by_region.setdefault(sd[0], []).append(sd)
    out = []
    for k, group in by_region.items():
        region = regions == k
        if len(group) == 1:
            parts = [(group[0], region)]
        else:
            ys, xs = np.nonzero(region)
            d = np.stack([(ys - g[1]) ** 2 + (xs - g[2]) ** 2 for g in group])
            owner = d.argmin(axis=0)
            parts = []
            for i, g in enumerate(group):
                m = np.zeros_like(region)
                m[ys[owner == i], xs[owner == i]] = True
                parts.append((g, m))
        for (_, _, _, lab), m in parts:
            sl = ndi.find_objects(m.astype(np.int8))[0]
            lr = largest_rect(m[sl])
            inner = (sl[1].start + lr[0], sl[0].start + lr[1], sl[1].start + lr[2], sl[0].start + lr[3])
            out.append({
                'area': lab['area'], 'label': [round(lab['x'], 2), round(lab['y'], 2)],
                'inner': to_m(inner, org),
                'bbox': to_m((sl[1].start, sl[0].start, sl[1].stop, sl[0].stop), org),
                'rects': [to_m(rr, org) for rr in rects_from_mask(m, min_px=6)],
                'fixtures': round(float(fixture_mask[sl][m[sl]].mean()), 4),
                'measured': round(float(m.sum()) / PX_PER_M ** 2, 2),
            })
    swings = []
    dl, _ = ndi.label(ndi.binary_closing(door_mask, np.ones((5, 5))))
    for sl in ndi.find_objects(dl):
        w = (sl[1].stop - sl[1].start) / PX_PER_M
        h = (sl[0].stop - sl[0].start) / PX_PER_M
        if 0.4 < max(w, h) < 1.6:
            swings.append(to_m((sl[1].start, sl[0].start, sl[1].stop, sl[0].stop), org))
    return out, swings


def fixtures(fixture_mask, org):
    """Sanitary symbols (shower trays, toilets, basins, tubs) as boxes, classified by size."""
    lab, n = ndi.label(ndi.binary_closing(fixture_mask, np.ones((5, 5))))
    out = []
    for sl in ndi.find_objects(lab):
        w = (sl[1].stop - sl[1].start) / PX_PER_M
        h = (sl[0].stop - sl[0].start) / PX_PER_M
        lo, hi = min(w, h), max(w, h)
        if hi < 0.25 or hi > 2.0 or lo < 0.15:
            continue
        kind = 'bath' if hi > 1.3 else 'shower' if lo > 0.68 else 'toilet' if hi > 0.55 else 'basin'
        out.append({'kind': kind, 'rect': to_m((sl[1].start, sl[0].start, sl[1].stop, sl[0].stop), org)})
    # drains / taps drawn inside a shower tray or tub are part of it, not separate basins
    trays = [f['rect'] for f in out if f['kind'] in ('shower', 'bath')]
    inside = lambda r, t: t[0] - 0.02 <= (r[0] + r[2]) / 2 <= t[2] + 0.02 and t[1] - 0.02 <= (r[1] + r[3]) / 2 <= t[3] + 0.02
    return [f for f in out if f['kind'] in ('shower', 'bath') or not any(inside(f['rect'], t) for t in trays)]


def analyze(page):
    cal = calibrate(page)
    M, org = layer_masks(page, cal)
    rc = ndi.binary_opening(M['rc'], np.ones((3, 3)))
    block = ndi.binary_closing(M['block'], np.ones((6, 6)))
    block = ndi.binary_opening(block, np.ones((3, 3)))
    walls = rc | block

    # drop specks (dimension ticks, arrow heads)
    lab, n = ndi.label(walls)
    sizes = ndi.sum(walls, lab, range(1, n + 1))
    walls = np.isin(lab, np.flatnonzero(sizes >= 40) + 1)

    # footprint: everything enclosed by the outer walls (fill holes of the closed wall mask)
    ys, xs = np.nonzero(walls)
    footprint = np.zeros_like(walls)
    footprint[ys.min():ys.max() + 1, xs.min():xs.max() + 1] = True

    # openings: bridge gaps along walls (doorways / windows up to 2.4 m wide)
    span = int(3.2 * PX_PER_M)
    thin = int(0.42 * PX_PER_M)
    gaps = np.zeros_like(walls)
    for k in ((1, span), (span, 1)):
        g = ndi.binary_closing(walls, np.ones(k)) & ~walls & footprint
        # bridging also fills whole room strips between parallel walls; cut those away so the
        # wall-thick bands in actual openings separate from them
        big = ndi.binary_dilation(ndi.binary_opening(g, np.ones((thin + 2, thin + 2))), np.ones((3, 3)))
        g = ndi.binary_opening(g & ~big, np.ones((4, 4)))
        lab_, n_ = ndi.label(g)
        for j, sl in enumerate(ndi.find_objects(lab_), start=1):
            across = (sl[0].stop - sl[0].start) if k[0] == 1 else (sl[1].stop - sl[1].start)
            if across <= thin:
                gaps[sl] |= lab_[sl] == j
    balc = ndi.binary_closing(M['balcony'], np.ones((5, 5)))

    openings = []
    # facade openings: walk each outer wall band and take every stretch with no wall in it
    ys, xs = np.nonzero(footprint)
    fy0, fy1, fx0, fx1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    # the facade line on each side is the outermost row/column that is substantially wall
    # (floors 2-3 step back behind terraces, so the footprint edge is not the facade)
    rows = walls[:, fx0:fx1].mean(axis=1)
    cols = walls[fy0:fy1, :].mean(axis=0)
    fy0 = int(np.flatnonzero(rows > 0.25)[0])
    fy1 = int(np.flatnonzero(rows > 0.25)[-1]) + 1
    fx0 = int(np.flatnonzero(cols > 0.25)[0])
    fx1 = int(np.flatnonzero(cols > 0.25)[-1]) + 1
    band = int(0.24 * PX_PER_M)
    sides = [
        ('north', (slice(fy0, fy0 + band), slice(fx0, fx1)), 0, -1),
        ('south', (slice(fy1 - band, fy1), slice(fx0, fx1)), 0, 1),
        ('west', (slice(fy0, fy1), slice(fx0, fx0 + band)), 1, -1),
        ('east', (slice(fy0, fy1), slice(fx1 - band, fx1)), 1, 1),
    ]
    for side, sl, axis, out_dir in sides:
        cover = walls[sl].any(axis=axis)
        edges = np.flatnonzero(np.diff(np.concatenate(([1], cover.view(np.int8), [1]))))
        for a_, b_ in zip(edges[::2], edges[1::2]):
            if (b_ - a_) < 0.5 * PX_PER_M or a_ == 0 or b_ == len(cover):
                continue
            if axis == 0:
                r = (sl[1].start + a_, sl[0].start, sl[1].start + b_, sl[0].stop)
            else:
                r = (sl[1].start, sl[0].start + a_, sl[1].stop, sl[0].start + b_)
            # look just outside the facade for a balcony slab, and inside the gap for glazing
            o = int(0.6 * PX_PER_M)
            if axis == 0:
                outside = (slice(r[1] - o, r[1]) if out_dir < 0 else slice(r[3], r[3] + o), slice(r[0], r[2]))
            else:
                outside = (slice(r[1], r[3]), slice(r[0] - o, r[0]) if out_dir < 0 else slice(r[2], r[2] + o))
            gap_sl = (slice(r[1], r[3]), slice(r[0], r[2]))
            kind = 'balconyDoor' if balc[outside].any() else ('window' if M['glass'][gap_sl].any() else 'opening')
            openings.append({'rect': to_m(r, org), 'kind': kind, 'side': side})
    perimeter = np.zeros_like(walls)
    perimeter[fy0:fy0 + band] = perimeter[fy1 - band:fy1] = True
    perimeter[:, fx0:fx0 + band] = perimeter[:, fx1 - band:fx1] = True
    glab, gn = ndi.label(gaps & ~perimeter)
    for i, sl in enumerate(ndi.find_objects(glab), start=1):
        region = glab[sl] == i
        r = (sl[1].start, sl[0].start, sl[1].stop, sl[0].stop)
        w_m = max(r[2] - r[0], r[3] - r[1]) / PX_PER_M
        t_m = min(r[2] - r[0], r[3] - r[1]) / PX_PER_M
        if w_m < 0.6 or w_m > 2.2 or t_m > 0.32:
            continue
        openings.append({'rect': to_m(r, org), 'kind': 'door'})

    # balcony slabs: magenta outlines outside the footprint
    balconies = []
    blab, bn = ndi.label(ndi.binary_fill_holes(balc) & ~footprint)
    for i, sl in enumerate(ndi.find_objects(blab), start=1):
        r = (sl[1].start, sl[0].start, sl[1].stop, sl[0].stop)
        if (r[2] - r[0]) * (r[3] - r[1]) < 0.4 * PX_PER_M * PX_PER_M:
            continue
        balconies.append(to_m(r, org))

    fp = rects_from_mask(ndi.binary_opening(footprint, np.ones((6, 6))), min_px=6)
    units = unit_tags(page, cal)
    fix_mask = M['fixture']
    rooms, swings = extract_rooms(walls, footprint, org, room_labels(page, cal), fix_mask, M['door'])
    return {
        'calibration': {k: round(v, 4) for k, v in cal.items()},
        'walls': [to_m(r, org) for r in rects_from_mask(walls)],
        'openings': openings,
        'balconies': balconies,
        'footprint': [to_m(r, org) for r in fp],
        'facade': to_m((fx0, fy0, fx1, fy1), org),
        'units': units,
        'rooms': rooms,
        'doorSwings': swings,
        'fixtures': fixtures(fix_mask, org),
    }


def main(src, dst):
    doc = pymupdf.open(src)
    out = {'source': src.replace('\\', '/').split('/')[-1], 'width': 35.0, 'depth': 18.2, 'sheets': []}
    for sh in SHEETS:
        data = analyze(doc[sh['page'] - 1])
        out['sheets'].append({**{k: v for k, v in sh.items() if k != 'page'}, 'page': sh['page'], **data})
        print(f"page {sh['page']}: {len(data['walls'])} wall boxes, {len(data['openings'])} openings, "
              f"{len(data['balconies'])} balconies, {len(data['units'])} unit tags", file=sys.stderr)
    with open(dst, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
