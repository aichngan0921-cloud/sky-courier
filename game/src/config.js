// Sky Courier: constants for the flight model, the course and the look.
// One world unit is one foot. Speeds are stored in feet per second and
// shown to the player in knots and feet.
export const VIEW_W = 1280;
export const VIEW_H = 720;
export const STEP = 1 / 60;

export const BEST_KEY = 'skycourier-best';

// Flight model.
export const MIN_SPEED = 70; // ft/s, about 41 kt: below this the plane stalls
export const MAX_SPEED = 370; // ft/s, about 219 kt at full throttle
export const CRUISE_SPEED = 210; // ft/s, about 124 kt
export const TURN_RATE = 0.55; // radians per second at full bank
export const MAX_BANK = 0.6; // radians of visual bank
export const CLIMB_RATE = 55; // ft/s at full pull and full throttle
export const SINK_RATE = 70; // ft/s at full push
export const FUEL_START = 100;
export const FUEL_BURN = 0.55; // percent per second at full throttle
export const TIME_LIMIT = 150; // seconds to finish the course

// The course: five rings, then the runway. Ring x/y/z are world feet.
export const RINGS = [
  { x: -140, y: 300, z: 700, r: 65 },
  { x: 170, y: 340, z: 1500, r: 65 },
  { x: -90, y: 260, z: 2300, r: 65 },
  { x: 220, y: 380, z: 3100, r: 65 },
  { x: 0, y: 300, z: 3900, r: 65 },
];
export const RING_POINTS = 100;
export const RUNWAY = { x: 0, z: 4700, length: 420, width: 46 };
export const LANDING_BONUS = 500;
export const START = { x: 0, y: 320, z: 0, heading: 0, speed: 200 };

// Look.
export const SKY_TOP = '#2f5d8f';
export const SKY_HORIZON = '#f2c98a';
export const GROUND_FAR = '#7fae62';
export const GROUND_NEAR = '#4e8a3f';
