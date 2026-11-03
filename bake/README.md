# 360° tours: photoreal panoramas of floors 1–2 and the shops

Every apartment on floors 1–2 and every ground-floor shop has a 360° tour (the "360° tour" button on
the unit card, or `#pano=<id>/<room>` links such as `#pano=f2-3/living` or `#pano=shop-evos/front`).
The panoramas are path-traced in Blender Cycles from the same show-flat geometry as the 3D
walk-through, so the two always match.

## What is in a tour

- **Show-flat, not survey:** the apartments use the walk-through's show-flat. The plan is enlarged
  1.35× around the flat's centre, while furniture, doors and fixtures keep their real size, so rooms
  feel generous. The viewer says so in a note, and the m² figures shown are the real ones from the
  drawings.
- **One stop per room as a buyer sees it** (`src/pano/rooms.js`):
  - A bathroom split into WC + shower on the drawings is one stop.
  - Halls under 4.5 m² fold into the room they open onto.
  - Balconies too narrow to stand on are left out.
- **Shops:** the five shops (`src/building/shops.js`) have two stops each: the front by the windows
  and the counter / fitting area at the back.

## Changing a shop's brand

Edit its entry in `SHOPS` in `src/building/shops.js`:

- **Fields:** `brand`, `kind` (`cafe`, `fastfood`, `restaurant` or `fashion`), `tagline` and
  `colors`.
- **Colours:** the current colours are stand-ins until the tenants' official brand assets arrive.

Then re-run the two steps below for that shop only (for example `shop-evos`).

## Re-rendering

1. Start the dev server (`npm run dev`) and open
   `http://localhost:5173/pano-bake.html`.
   - To export only some units, add `?units=f2-3,shop-evos`.
   - This writes the scenes to `bake/out/` and the tour data to `public/pano/<id>/tour.json`.
2. Render on the NVIDIA GPU with Blender (the copy shipped in `../panoramic/tools/blender/` works):

   ```bash
   ../panoramic/tools/blender/blender.exe -b --factory-startup -P bake/render_blender.py -- --width 4096 --samples 384
   ```

   - **Filters:** add `--variants shop-evos` for one unit, or `--rooms living,front` for some stops.
   - **Quick look:** `--preview --width 1536 --samples 128` renders low-res previews to
     `public/pano/_preview/`.
   - **Output:** each stop is written as `public/pano/<id>/<stop>.jpg` (4096×2048) plus a
     `<stop>-2k.jpg` for phones.
   - **Time:** on the RTX 5060 a 4K stop takes about a minute; all 68 stops take about 1–1.5 hours.

`bake/hdri/residential_garden.hdr` (copied from the panoramic project) lights the scenes and is the
view through the windows. `bake/out/` and `bake/hdri/` are not committed.
