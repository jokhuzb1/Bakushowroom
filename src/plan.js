// Floor plan data for a single unit. Everything in the 3D scene is generated from this.
// Plan coordinates are in meters: x runs east, y runs south (it becomes +z in 3D).
// Walls are described by their centerline; openings are [start, end] distances along the wall from `a`.

export const unit = {
  id: '2B',
  name: 'Residence 2B',
  floor: 4,
  height: 2.8,
  floorElevation: 12, // meters above ground, used for the view out of the windows

  walls: [
    // exterior
    {
      a: [0, 0], b: [10, 0], t: 0.25, exterior: true,
      openings: [
        { type: 'slider', from: 1.3, to: 2.9, sill: 0, head: 2.45 },
        { type: 'window', from: 3.4, to: 5.6, sill: 0.45, head: 2.45 },
        { type: 'window', from: 7.0, to: 9.0, sill: 0.9, head: 2.4 },
      ],
    },
    {
      a: [10, 0], b: [10, 8], t: 0.25, exterior: true,
      openings: [{ type: 'window', from: 5.3, to: 7.1, sill: 0.9, head: 2.4 }],
    },
    {
      a: [0, 8], b: [10, 8], t: 0.25, exterior: true,
      openings: [{ type: 'entry', from: 4.05, to: 5.0, sill: 0, head: 2.15 }],
    },
    {
      a: [0, 0], b: [0, 8], t: 0.25, exterior: true,
      openings: [
        { type: 'window', from: 0.6, to: 1.9, sill: 0.9, head: 2.4 },
        { type: 'window', from: 5.9, to: 6.7, sill: 1.55, head: 2.25 },
      ],
    },
    // interior partitions
    {
      a: [6, 0], b: [6, 8], t: 0.12,
      openings: [
        { type: 'door', from: 3.15, to: 3.95, sill: 0, head: 2.1, swing: -1, hinge: 'to' },
        { type: 'door', from: 6.9, to: 7.7, sill: 0, head: 2.1, swing: -1, hinge: 'to' },
      ],
    },
    { a: [6, 4.2], b: [10, 4.2], t: 0.12, openings: [] },
    {
      a: [0, 4.6], b: [6, 4.6], t: 0.12,
      openings: [{ type: 'opening', from: 3.4, to: 5.2, sill: 0, head: 2.3 }],
    },
    {
      a: [3, 4.6], b: [3, 8], t: 0.12,
      openings: [{ type: 'door', from: 0.9, to: 1.7, sill: 0, head: 2.1, swing: 1, hinge: 'from' }],
    },
  ],

  // Rooms are axis-aligned rectangles on wall centerlines. `kit` picks the style kit for the room type.
  rooms: [
    { id: 'living', name: 'Living & Kitchen', kit: 'living', rect: [0, 0, 6, 4.6], floor: 'oak' },
    { id: 'master', name: 'Master Bedroom', kit: 'bedroom', rect: [6, 0, 10, 4.2], floor: 'oak' },
    { id: 'bed2', name: 'Bedroom 2', kit: 'bedroom', rect: [6, 4.2, 10, 8], floor: 'oak' },
    { id: 'hall', name: 'Entrance Hall', kit: 'hall', rect: [3, 4.6, 6, 8], floor: 'oak' },
    { id: 'bath', name: 'Bathroom', kit: 'bathroom', rect: [0, 4.6, 3, 8], floor: 'stone', wallFinish: { material: 'wallTile', height: 2.4 } },
    { id: 'balcony', name: 'Balcony', kit: 'balcony', rect: [1, -1.6, 5, 0], floor: 'deck', outdoor: true },
  ],
};
