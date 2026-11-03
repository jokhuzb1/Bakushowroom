"""360° bake, step 2 of 2: path-traces equirectangular panoramas of the scenes exported by pano-bake.html.

    <blender> -b --factory-startup -P bake/render_blender.py -- [options]

Options (after "--"):
    --variants f2-3,shop-evos      only these scenes (default: every bake/out/*.json)
    --rooms living,bath            only these tour stops
    --width 4096                   output width (height = width / 2)
    --samples 512                  max samples per pixel (adaptive, denoised)
    --exposure 1.2                 view exposure in stops
    --preview                      write to public/pano/_preview/ instead (no 2k copy)
    --skip-existing                leave panoramas that are already rendered

Writes public/pano/<scene>/<stop>.jpg and a <stop>-2k.jpg copy for phones. Renders on the NVIDIA GPU
(OptiX, else CUDA); falls back to the CPU with a warning.
"""
import argparse
import glob
import json
import math
import os
import sys

import bpy
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_SCENES = os.path.join(ROOT, 'bake', 'out')
PANO_DIR = os.path.join(ROOT, 'public', 'pano')
HDRI = os.path.join(ROOT, 'bake', 'hdri', 'residential_garden.hdr')
# the street views have their own buildings all round: a sky-only HDRI over them
SKY_HDRI = os.path.join(ROOT, 'bake', 'hdri', 'kloofendal_48d_partly_cloudy_puresky.hdr')
# like a photographer, open up a little in rooms with little or no daylight
ROOM_EXPOSURE = {'living': 0.15, 'bedroom': 0.35, 'hall': 0.2, 'bath': -0.25, 'balcony': -0.5, 'shopFront': -0.35, 'shopBack': -0.2, 'street': -1.1}


def args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument('--variants', default='')
    p.add_argument('--rooms', default='')
    p.add_argument('--width', type=int, default=4096)
    p.add_argument('--samples', type=int, default=512)
    p.add_argument('--exposure', type=float, default=1.2)
    p.add_argument('--hdri-rotation', type=float, default=200.0)
    p.add_argument('--preview', action='store_true')
    p.add_argument('--skip-existing', action='store_true')
    return p.parse_args(argv)


def b(v):
    """three.js (x, y, z) Y-up -> Blender (x, -z, y) Z-up."""
    return Vector((v[0], -v[2], v[1]))


def setup_render(o):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    prefs = bpy.context.preferences.addons['cycles'].preferences
    for backend in ('OPTIX', 'CUDA'):
        try:
            prefs.compute_device_type = backend
            prefs.get_devices()
            gpus = [d for d in prefs.devices if d.type == backend]
            if gpus:
                for d in prefs.devices:
                    d.use = d.type == backend
                scene.cycles.device = 'GPU'
                print(f'Using {backend}: {[d.name for d in gpus]}', flush=True)
                break
        except Exception as e:  # backend not available on this machine
            print(f'{backend} unavailable: {e}')
    else:
        print('WARNING: no NVIDIA GPU backend found, rendering on CPU (slow).', flush=True)
        scene.cycles.device = 'CPU'

    c = scene.cycles
    c.samples = o.samples
    c.use_adaptive_sampling = True
    c.adaptive_threshold = 0.008
    c.use_denoising = True
    c.denoiser = 'OPENIMAGEDENOISE'
    c.denoising_input_passes = 'RGB_ALBEDO_NORMAL'
    c.denoising_prefilter = 'ACCURATE'
    try:
        c.denoising_use_gpu = True
    except AttributeError:
        pass
    c.max_bounces = 12
    c.diffuse_bounces = 6
    c.glossy_bounces = 4
    c.transmission_bounces = 8
    c.transparent_max_bounces = 8
    c.caustics_reflective = False
    c.caustics_refractive = False
    c.blur_glossy = 0.6
    c.sample_clamp_indirect = 8.0
    c.use_light_tree = True

    r = scene.render
    r.resolution_x = o.width
    r.resolution_y = o.width // 2
    r.resolution_percentage = 100
    r.image_settings.file_format = 'JPEG'
    r.image_settings.quality = 90
    r.film_transparent = False

    vs = scene.view_settings
    vs.view_transform = 'AgX'
    try:
        vs.look = 'AgX - Medium High Contrast'
    except TypeError:
        pass
    vs.exposure = o.exposure


def setup_world(o, hdri=HDRI):
    world = bpy.data.worlds.new('Sky')
    bpy.context.scene.world = world
    world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()
    coord = nt.nodes.new('ShaderNodeTexCoord')
    mapping = nt.nodes.new('ShaderNodeMapping')
    mapping.inputs['Rotation'].default_value[2] = math.radians(o.hdri_rotation)
    env = nt.nodes.new('ShaderNodeTexEnvironment')
    env.image = bpy.data.images.load(hdri)
    bg = nt.nodes.new('ShaderNodeBackground')
    bg.inputs['Strength'].default_value = 1.0
    out = nt.nodes.new('ShaderNodeOutputWorld')
    nt.links.new(coord.outputs['Generated'], mapping.inputs['Vector'])
    nt.links.new(mapping.outputs['Vector'], env.inputs['Vector'])
    nt.links.new(env.outputs['Color'], bg.inputs['Color'])
    nt.links.new(bg.outputs['Background'], out.inputs['Surface'])
    world.cycles.sampling_method = 'MANUAL'
    world.cycles.sample_map_resolution = 2048


def add_lights(lights):
    for i, l in enumerate(lights):
        kind = {'spot': 'SPOT', 'point': 'POINT', 'sun': 'SUN'}[l['type']]
        data = bpy.data.lights.new(f'L{i}', kind)
        data.color = l['color'][:3]
        obj = bpy.data.objects.new(f'L{i}', data)
        bpy.context.scene.collection.objects.link(obj)
        if kind == 'SUN':
            to_sun = b(l['toSun']).normalized()
            obj.rotation_euler = (-to_sun).to_track_quat('-Z', 'Y').to_euler()
            data.energy = l['strength']
            data.angle = math.radians(0.8)
            continue
        data.energy = l['watts']
        data.shadow_soft_size = l.get('radius', 0.05)
        obj.location = b(l['pos'])
        if kind == 'SPOT':
            d = (b(l['target']) - obj.location).normalized()
            obj.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
            data.spot_size = min(math.pi, l['angle'] * 2)
            data.spot_blend = l['blend']


def tune_materials():
    for obj in bpy.data.objects:
        if obj.type != 'MESH':
            continue
        for slot in obj.material_slots:
            mat = slot.material
            if not mat or not mat.use_nodes:
                continue
            bsdf = next((n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
            if not bsdf:
                continue
            # window glass shouldn't cast shadows, or daylight turns into a noisy caustic
            if bsdf.inputs['Transmission Weight'].default_value > 0.5:
                obj.visible_shadow = False


def render_rooms(meta, o):
    scene = bpy.context.scene
    cam_data = bpy.data.cameras.new('Pano')
    cam_data.type = 'PANO'
    try:
        cam_data.panorama_type = 'EQUIRECTANGULAR'
    except AttributeError:
        cam_data.cycles.panorama_type = 'EQUIRECTANGULAR'
    cam_data.clip_start = 0.02
    cam = bpy.data.objects.new('Pano', cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    # image centre faces three.js -x, so u = 0 is +x: the tour's sphere mapping (src/pano/viewer.js)
    cam.rotation_euler = (math.pi / 2, 0, math.pi / 2)

    only = set(filter(None, o.rooms.split(',')))
    out_dir = os.path.join(PANO_DIR, '_preview') if o.preview else PANO_DIR
    for room in meta['rooms']:
        if only and room['id'] not in only:
            continue
        path = os.path.join(out_dir, room['output'] + '.jpg')
        if o.skip_existing and os.path.exists(path):
            continue
        os.makedirs(os.path.dirname(path), exist_ok=True)
        cam.location = b(room['cam'])
        scene.view_settings.exposure = o.exposure + ROOM_EXPOSURE.get(room.get('kind'), 0)
        scene.render.filepath = path
        print(f"Rendering {room['output']} -> {path}", flush=True)
        bpy.ops.render.render(write_still=True)
        if not o.preview:
            img = bpy.data.images.load(path)
            img.scale(o.width // 2, o.width // 4)
            img.filepath_raw = os.path.join(out_dir, room['output'] + '-2k.jpg')
            img.file_format = 'JPEG'
            img.save()
            bpy.data.images.remove(img)


def main():
    o = args()
    only = set(filter(None, o.variants.split(',')))
    for meta_path in sorted(glob.glob(os.path.join(OUT_SCENES, '*.json'))):
        with open(meta_path) as f:
            meta = json.load(f)
        if only and meta['variant'] not in only:
            continue
        bpy.ops.wm.read_factory_settings(use_empty=True)
        setup_render(o)
        setup_world(o, SKY_HDRI if meta.get('exterior') else HDRI)
        bpy.ops.import_scene.gltf(filepath=meta_path[:-5] + '.glb')
        add_lights(meta.get('lights', []))
        tune_materials()
        render_rooms(meta, o)


main()
