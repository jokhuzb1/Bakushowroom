"""Draw extracted geometry for one sheet to a PNG for visual QA: python -I tools/preview_plan.py <page> <out.png>"""
import sys
import time

import pymupdf

sys.path.insert(0, 'tools')
import extract_plan as E  # noqa: E402

page_no, out = int(sys.argv[1]), sys.argv[2]
t = time.time()
s = E.analyze(pymupdf.open('input/baku-city-16.pdf')[page_no - 1])
S = 20
ox, oy = 2 * S, 6 * S
doc = pymupdf.open()
pg = doc.new_page(width=39 * S, height=27 * S)
R = lambda r: pymupdf.Rect(ox + r[0] * S, oy + r[1] * S, ox + r[2] * S, oy + r[3] * S)
for r in s['footprint']:
    pg.draw_rect(R(r), color=None, fill=(0.93, 0.93, 0.9))
for r in s['balconies']:
    pg.draw_rect(R(r), color=(0.8, 0, 0.8), fill=(1, 0.85, 1), width=0.6)
palette = [(1, .8, .6), (.7, .9, .7), (.7, .8, 1), (1, .7, .8), (.9, .9, .6), (.8, .7, 1), (.6, .9, .9), (1, .85, .5), (.85, .75, .65)]
for i, u in enumerate(s['units']):
    for r in u.get('rects', []):
        pg.draw_rect(R(r), color=None, fill=palette[i % len(palette)])
for r in s['walls']:
    pg.draw_rect(R(r), color=None, fill=(0.1, 0.1, 0.1))
col = {'door': (0.9, 0.5, 0), 'window': (0, 0.5, 1), 'balconyDoor': (0.8, 0, 0.8), 'opening': (0, 0.7, 0)}
for o in s['openings']:
    pg.draw_rect(R(o['rect']), color=None, fill=col[o['kind']])
for u in s['units']:
    pg.insert_text((ox + u['x'] * S - 12, oy + u['y'] * S), f"#{u['type']} {u['area']} ({u.get('measured')})", fontsize=7, color=(0.8, 0, 0))
pg.get_pixmap(dpi=110).save(out)
print(len(s['walls']), 'walls', len(s['openings']), 'openings', len(s['units']), 'units', round(time.time() - t, 1), 's')
