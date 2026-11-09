# 360° tours: photoreal panoramas of floors 1–2

Every apartment on floors 1–2 has a 360° tour (the "360° tour" button on the unit card, or `#pano=<id>/<room>`
links such as `#pano=f2-3/living`).
The panoramas are path-traced in Blender Cycles from the same show-flat geometry as the 3D
walk-through, so the two always match.

## What is in a tour

- **Show-flat, not survey:** the apartments use the walk-through's show-flat. The plan is enlarged
  around the flat's centre (1.22× across, 1.04× deep: about 27% more floor), while furniture, doors and fixtures keep their real size, so rooms
  feel generous without becoming halls. The viewer says so in a note, and the m² figures shown are the real ones from the
  drawings.
- **One stop per room as a buyer sees it** (`src/pano/rooms.js`):
  - A bathroom split into WC + shower on the drawings is one stop.
  - Halls under 4.5 m² fold into the room they open onto.
  - Balconies too narrow to stand on are left out.
- **Lighting:** bathrooms and small rooms get a ceiling light for the bake only (the 3D view keeps its
  light count down).
## Designs

Every tour is rendered in each design in `DESIGNS` (`src/pano/units.js`): Warm minimal (`public/pano/<id>/`) and
Hi-tech (`public/pano/<id>/hitech/`, styled in `src/styles/hiTech.js`). The layouts match, so a tour switches design
without moving. Hi-tech's furniture is written in sand3d: see `tools/sand3d/README.md`.

## Exterior

`/pano-bake.html?units=exterior`, then `--variants exterior`: the whole complex in daylight, as 4K stills (`public/renders/`)
and a 360° tour (`public/pano/exterior/`, the "Outside 360°" button). The views are at the top of `src/pano/bake.js`.

## Commercial branch

Floor 1's commercial hall is one more tour, `f1-branch` (`src/building/branch.js`): the drawn walls at their real size, one
design, the real street outside the shopfront. The brand is the `BRANCH` entry in that file. To re-render only the branch:
`/pano-bake.html?units=f1-branch`, then `--variants f1-branch`.

## Floor 1 plan

Floor 1 (hall + 4 flats) is planned from sheet АР-8 at the street-level slot of section A-A (+0.00, 4.74 m high). Flat areas
and room counts come from АР-9 (sheet 0 in `building.json`), which draws the same flats. After a new revision of either sheet:

```bash
python -I tools/update_podium.py input/АР-8.pdf input/АР-9.pdf public/data/building.json
```

## Re-rendering

1. Start the dev server (`npm run dev`) and open
   `http://localhost:5173/pano-bake.html`.
   - To export only some units, add `?units=f2-3,f1-1`; only one design, `?designs=hitech`.
   - This writes the scenes to `bake/out/` and the tour data to `public/pano/<id>/tour.json`.
2. Render on the NVIDIA GPU with Blender (the copy shipped in `../panoramic/tools/blender/` works):

   ```bash
   ../panoramic/tools/blender/blender.exe -b --factory-startup -P bake/render_blender.py -- --width 4096 --samples 384
   ```

   - **Filters:** add `--variants f1-1` for one unit, `--designs hitech` for one design, or `--rooms living,hall` for some stops.
   - **Quick look:** `--preview --width 1536 --samples 128` renders low-res previews to
     `public/pano/_preview/`.
   - **Output:** each stop is written as `public/pano/<id>/<stop>.jpg` (4096×2048) plus a
     `<stop>-2k.jpg` for phones.
   - **Time:** on the RTX 5060 a 4K stop takes about a minute; all stops of one design take about 1–1.5 hours.

`bake/hdri/residential_garden.hdr` (copied from the panoramic project) lights the interiors and is the
view through the windows; the street view uses the sky-only `kloofendal_48d_partly_cloudy_puresky.hdr`
and a sun matching the 3D view. `bake/out/` and `bake/hdri/` are not committed.
