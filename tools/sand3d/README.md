# sand3d: furniture as short Python programs

[sand3d](https://github.com/Sandflow-ai/sand3d) (Apache-2.0) writes 3D objects as programs over Blender's `bpy`. Here it
models the Hi-tech design's furniture (`hitech_kit.py` → `public/models/ht_*.glb`), which then go through the normal 360°
bake. `api.md` is its vocabulary.

It needs no separate `bpy`: the Blender in `../panoramic/tools/blender/` has the same Python (3.13) and `bpy` (5.2) that
sand3d 1.6.1 asks for, so the library goes in `tools/sand3d/lib/` (not committed) and runs inside Blender:

```bash
../panoramic/tools/blender/5.2/python/bin/python.exe -m pip install --no-deps --target tools/sand3d/lib sand3d==1.6.1
```

```bash
../panoramic/tools/blender/blender.exe -b --factory-startup -P tools/sand3d/hitech_kit.py -- --preview
```

`--preview` also path-traces each piece to `shots/ht_<piece>.png`.
