"""
Bring the podium levels in public/data/building.json in line with the revised drawings.

Usage: python -I tools/update_podium.py input/АР-8.pdf input/АР-9.pdf public/data/building.json

  - Floor 1 is re-extracted from АР-9 ("Разбивочный план 1-этажа"). Its layout is the one the original
    sheet showed, so the original room labels are kept (corrected as below).
  - The plinth floor (цокольный этаж, АР-8) is added as floor 0, with one room per enclosed space; behind
    the commercial hall its walls repeat floor 1's, so those rooms take floor 1's labels.
  - Floors 2-3 come from original sheets that are not in input/ any more. Like the original floor 1,
    they were calibrated on the И bubble, which those sheets draw 1.155 m off its axis (И and Ж are
    0.4 m apart, so the bubbles sit on leaders): everything came out 1.155 m too far south. The offset
    is measured by matching the original floor 1 against АР-9 (same walls, same lengths); it is
    removed once, and the file records that it was.
"""
import json
import sys

import pymupdf

sys.path.insert(0, 'tools')
import extract_plan as E  # noqa: E402

DY = -1.155
PLINTH = {'floors': [0], 'name': 'Plinth floor (цокольный этаж)', 'height': 3.0}


def shift_sheet(s, dy):
    ry = lambda r: [r[0], round(r[1] + dy, 3), r[2], round(r[3] + dy, 3)]
    for k in ('walls', 'balconies', 'footprint', 'doorSwings'):
        s[k] = [ry(r) for r in s.get(k, [])]
    s['facade'] = ry(s['facade'])
    for o in s.get('openings', []) + s.get('fixtures', []):
        o['rect'] = ry(o['rect'])
    for r in s.get('rooms', []):
        r['label'] = [r['label'][0], round(r['label'][1] + dy, 2)]
        r['inner'], r['bbox'] = ry(r['inner']), ry(r['bbox'])
        r['rects'] = [ry(q) for q in r['rects']]
    for u in s.get('units', []):
        u['y'] = round(u['y'] + dy, 2)


def main(plinth_pdf, first_pdf, dst):
    with open(dst, encoding='utf-8') as f:
        d = json.load(f)
    sheets = d['sheets']
    first = sheets[0]
    if not d.get('podiumFix'):
        for s in sheets[1:3]:
            shift_sheet(s, DY)
        labels = [{'area': r['area'], 'x': r['label'][0], 'y': r['label'][1] + DY} for r in first['rooms']]
    else:
        labels = [{'area': r['area'], 'x': r['label'][0], 'y': r['label'][1]} for r in first['rooms']]
    data = E.analyze(pymupdf.open(first_pdf)[0], labels=labels)
    data['units'] = first['units']  # АР-9 has no apartment tags; keep the original ones
    if not d.get('podiumFix'):
        for u in data['units']:
            u['y'] = round(u['y'] + DY, 2)
    sheets[0] = {**{k: first[k] for k in ('floors', 'name', 'height')}, 'source': 'АР-9', **data}
    behind = [lab for lab in labels if lab['y'] > 8.2]
    plinth = {**PLINTH, 'source': 'АР-8', **E.analyze(pymupdf.open(plinth_pdf)[0], labels='auto', prefer=behind)}
    sheets[:] = [s for s in sheets if s['floors'] != [0]] + [plinth]
    d['podiumFix'] = DY
    with open(dst, 'w', encoding='utf-8') as f:
        json.dump(d, f, ensure_ascii=False, separators=(',', ':'))
    for s in (sheets[0], plinth):
        print(f"{s['name']}: {len(s['walls'])} walls, {len(s['openings'])} openings, {len(s['rooms'])} rooms", file=sys.stderr)


if __name__ == '__main__':
    main(*sys.argv[1:4])
