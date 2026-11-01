# 3D model credits

All `.glb` files in this folder come from [Poly Haven](https://polyhaven.com/models) and are licensed **CC0** (public domain):
free for commercial use, no attribution required. Downloaded at 1k texture resolution and recompressed
(WebP textures, quantized geometry) with `gltf-transform optimize`. Originals are kept in `input/polyhaven/raw/`.

To swap a model (e.g. for a purchased, higher-end piece), replace the `.glb` with the same file name, or add a
new id to `MODEL_IDS` in `src/building/models.js` and reference it from `src/building/interior.js`.
Models are expected to face +z; the loader rescales them to the space the layout gives them.
