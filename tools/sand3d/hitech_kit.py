"""Hi-tech furniture written in sand3d, built and exported by Blender's own Python.

    ../panoramic/tools/blender/blender.exe -b --factory-startup -P tools/sand3d/hitech_kit.py -- [--preview]

Writes public/models/ht_<piece>.glb (front towards -Y here, +z in glTF: the showroom's convention).
--preview also path-traces each piece to shots/ht_<piece>.png.
sand3d itself is not committed: see tools/sand3d/README.md.
"""
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(HERE, 'lib'))

import bpy  # noqa: E402
import sand3d as s3d  # noqa: E402

BLACK = dict(kind='painted_metal', color='#141518', roughness=0.32)
GUNMETAL = dict(kind='aluminium', color='#3a3d42', roughness=0.28)
LED = dict(kind='light', color='#f4f7ff', emission=14)


def dress(ob, spec):
    s3d.material(ob, spec['kind'], **{k: v for k, v in spec.items() if k != 'kind'})
    return ob


def linear_pendant(l=1400, drop=1000):
    """Suspended aluminium bar with a recessed LED diffuser, on two thin steel cables."""
    bar = dress(s3d.at(s3d.extrude('bar', s3d.rect(l, 56, r=4), 48), z=2), BLACK)
    led = dress(s3d.box('diffuser', l - 40, 34, 4), LED)
    cables = [dress(s3d.at(s3d.cylinder(f'cable{i}', 3, drop), x=x, z=50), dict(kind='steel', color='#c8ccd2'))
              for i, x in enumerate((-l * 0.36, l * 0.36))]
    rose = [dress(s3d.at(s3d.cylinder(f'rose{i}', 30, 12), x=x, z=drop + 50), BLACK) for i, x in enumerate((-l * 0.36, l * 0.36))]
    return s3d.assembly('linear_pendant', bar, led, *cables, *rose)


def glass_coffee_table(w=1000, d=620, h=370):
    """Clear glass slab floating on a brushed gunmetal sled with a lit lower shelf edge."""
    top = dress(s3d.at(s3d.extrude('top', s3d.rect(w, d, r=40), 12), z=h - 12), dict(kind='glass'))
    legs = []
    for i, x in enumerate((-w / 2 + 70, w / 2 - 70)):
        path = [(x, -d / 2 + 40, 8), (x, -d / 2 + 40, h - 16), (x, d / 2 - 40, h - 16), (x, d / 2 - 40, 8)]
        legs.append(dress(s3d.wire(f'sled{i}', path, 16, closed=True, fillet=8), GUNMETAL))
    rail = dress(s3d.at(s3d.box('rail', w - 140, 16, 16), y=-d / 2 + 40), GUNMETAL)
    rail2 = dress(s3d.at(s3d.box('rail2', w - 140, 16, 16), y=d / 2 - 40), GUNMETAL)
    shelf = dress(s3d.at(s3d.extrude('shelf', s3d.rect(w - 180, d - 150, r=10), 8), z=110), dict(kind='glossy_plastic', color='#0c0d10', roughness=0.08))
    return s3d.assembly('glass_coffee_table', top, *legs, rail, rail2, shelf)


def cantilever_chair(w=450, d=500, seat=450, back=830):
    """Chrome cantilever tube frame with a black leather seat and back."""
    def side(x, n):
        path = [(x, d / 2, 10), (x, -d / 2 + 20, 10), (x, -d / 2 + 20, seat - 25), (x, d / 2 - 60, seat - 25), (x, d / 2 - 10, back)]
        return dress(s3d.wire(n, path, 22, fillet=55), dict(kind='chrome'))
    frame = [side(-w / 2 + 15, 'tubeL'), side(w / 2 - 15, 'tubeR')]
    foot = dress(s3d.wire('foot', [(-w / 2 + 15, d / 2, 10), (w / 2 - 15, d / 2, 10)], 22), dict(kind='chrome'))
    pad = s3d.soften(s3d.at(s3d.box('seat', w - 20, d - 70, 50), y=-10, z=seat - 15), 14)
    rest = s3d.soften(s3d.at(s3d.box('back', w - 20, 34, 270), y=d / 2 - 35, z=back - 270, rx=-8), 12)
    leather = dict(kind='leather', color='#16171a', roughness=0.42)
    return s3d.assembly('cantilever_chair', *frame, foot, dress(pad, leather), dress(rest, leather))


def glass_dining_table(w=900, d=900, h=750):
    """Square glass top on a blackened steel cross pedestal with a floor plate."""
    plate = dress(s3d.extrude('plate', s3d.rect(w * 0.62, d * 0.62, r=20), 10), BLACK)
    a = dress(s3d.at(s3d.box('blade_a', w * 0.6, 14, h - 22), z=10, rz=45), BLACK)
    b = dress(s3d.at(s3d.box('blade_b', w * 0.6, 14, h - 22), z=10, rz=-45), BLACK)
    top = dress(s3d.at(s3d.extrude('top', s3d.rect(w, d, r=24), 12), z=h - 12), dict(kind='glass'))
    return s3d.assembly('glass_dining_table', plate, a, b, top)


def arc_floor_lamp(h=1850, reach=420):
    """Slim gunmetal mast from a round plate, ending in an LED blade over the seat."""
    plate = dress(s3d.extrude('plate', s3d.circle(280), 14), GUNMETAL)
    mast = dress(s3d.wire('mast', [(0, 0, 10), (0, 0, h - 200), (reach, 0, h)], 20, fillet=160), GUNMETAL)
    blade = dress(s3d.at(s3d.box('blade', 460, 60, 16), x=reach + 150, z=h - 8), BLACK)
    led = dress(s3d.at(s3d.box('led', 430, 40, 3), x=reach + 150, z=h - 10), LED)
    return s3d.assembly('arc_floor_lamp', plate, mast, blade, led)


PIECES = {'pendant': linear_pendant, 'coffee_table': glass_coffee_table, 'chair': cantilever_chair, 'dining_table': glass_dining_table, 'floor_lamp': arc_floor_lamp}


def preview(name, path):
    """The scene sand3d leaves is an ordinary Blender scene: light it and path-trace it."""
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 64
    scene.cycles.use_denoising = True
    scene.render.resolution_x = scene.render.resolution_y = 640
    world = bpy.data.worlds.new('w')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs[0].default_value = (0.8, 0.82, 0.85, 1)
    world.node_tree.nodes['Background'].inputs[1].default_value = 0.8
    scene.world = world
    bpy.context.view_layer.update()
    meshes = [o for o in scene.objects if o.type == 'MESH']
    pts = [o.matrix_world @ v.co for o in meshes for v in o.data.vertices]
    lo = [min(p[i] for p in pts) for i in range(3)]
    hi = [max(p[i] for p in pts) for i in range(3)]
    c = [(a + b) / 2 for a, b in zip(lo, hi)]
    r = max(b - a for a, b in zip(lo, hi))
    print('preview', name, [round(v, 3) for v in lo], [round(v, 3) for v in hi], flush=True)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    cam.data.clip_start, cam.data.clip_end = 0.001, 1e4
    scene.collection.objects.link(cam)
    cam.location = (c[0] + r * 1.2, c[1] - r * 2.0, c[2] + r * 0.9)
    d = (cam.location.__class__(c) - cam.location)
    cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    scene.camera = cam
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    print('sand3d', s3d.__version__, s3d.fingerprint(), 'blender', bpy.app.version_string, flush=True)
    for name, make in PIECES.items():
        s3d.empty_scene()
        ob = make()
        path = os.path.join(ROOT, 'public', 'models', f'ht_{name}.glb')
        s3d.export(ob, path)
        print('wrote', path, os.path.getsize(path), flush=True)
        if '--preview' in argv:
            os.makedirs(os.path.join(ROOT, 'shots'), exist_ok=True)
            preview(name, os.path.join(ROOT, 'shots', f'ht_{name}.png'))


main()
