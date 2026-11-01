# Window views

Drop a real 360° view photo here as **`panorama.jpg`** and the showroom uses it instead of the painted
skyline (no code change needed; reload the page).

- Format: a wide panoramic strip covering the full 360° from left to right (e.g. 8192 × 1536 px).
- Put the horizon roughly in the lower third; the area above the skyline should be sky.
- It is wrapped around the site at ~700 m, so the view out of every window and from the balconies shows it.

Photos taken per direction (e.g. one for the north / street side and one for the south / courtyard side)
can be stitched into one strip, or supported separately; see `src/building/backdrop.js`.
