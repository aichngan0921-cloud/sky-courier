// The world: the flight model, the ring course, the runway, the terrain
// and the scenery. One step advances the plane by a fixed slice of time
// and reports what happened as event bits.
import {
  CLIMB_RATE, CRUISE_SPEED, FUEL_BURN, FUEL_START, LANDING_BONUS,
  MAX_BANK, MAX_SPEED, MIN_SPEED, RING_POINTS, RINGS, RUNWAY, SINK_RATE,
  START, TIME_LIMIT, TURN_RATE,
} from './config.js';

export const EVENT_RING = 1;
export const EVENT_LAND = 2;
export const EVENT_CRASH = 4;
export const EVENT_OVER = 8;

function riverX(z) {
  return 320 * Math.sin(z * 0.0011);
}

export { riverX };

export function terrainHeight(x, z) {
  let h = 40 * Math.sin(x * 0.004 + 1.7) * Math.cos(z * 0.003)
    + 25 * Math.sin((x + z) * 0.002);
  const dist = Math.abs(x - riverX(z));
  if (dist < 60) h -= (60 - dist) * 0.5;
  // The runway sits on flat ground: blend the hills down near it.
  const nearRunway = Math.abs(x - RUNWAY.x) < 200 && z > RUNWAY.z - 400 && z < RUNWAY.z + RUNWAY.length + 400;
  if (nearRunway) h *= 0.15;
  return Math.max(h, -4);
}

export function createWorld(random) {
  const clouds = [];
  for (let i = 0; i < 16; i++) {
    clouds.push({
      x: random.range(-1600, 1600), y: random.range(520, 820),
      z: random.range(-400, 5200), s: random.range(90, 220),
    });
  }
  const trees = [];
  for (let i = 0; i < 130; i++) {
    const x = random.range(-900, 900);
    const z = random.range(100, 5000);
    if (Math.abs(x - RUNWAY.x) < 120 && z > RUNWAY.z - 300 && z < RUNWAY.z + RUNWAY.length + 300) continue;
    if (Math.abs(x - riverX(z)) < 50) continue;
    trees.push({ x, z, s: random.range(10, 22) });
  }
  const town = [];
  for (let i = 0; i < 26; i++) {
    town.push({
      x: random.range(260, 620), z: random.range(1900, 2600),
      w: random.range(24, 44), h: random.range(30, 90),
    });
  }

  const state = freshState();
  function freshState() {
    return {
      plane: {
        x: START.x, y: START.y, z: START.z, heading: START.heading,
        speed: START.speed, bank: 0, pitch: 0, throttle: 0.6, fuel: FUEL_START,
      },
      score: 0, ringIndex: 0, timeLeft: TIME_LIMIT,
      status: 'flying', message: '',
      ringsHit: 0, landed: false,
    };
  }

  function reset() {
    Object.assign(state, freshState());
  }

  function overRunway(p) {
    return Math.abs(p.x - RUNWAY.x) < RUNWAY.width / 2
      && p.z > RUNWAY.z - 40 && p.z < RUNWAY.z + RUNWAY.length + 40;
  }

  function step(dt, input, demo) {
    const p = state.plane;
    if (state.status !== 'flying') return 0;
    let events = 0;

    // Throttle and speed.
    p.throttle = Math.min(1, Math.max(0, p.throttle + input.throttle * dt * 0.7));
    const target = MIN_SPEED + p.throttle * (MAX_SPEED - MIN_SPEED);
    const rate = target > p.speed ? 55 : 38;
    p.speed += Math.min(Math.abs(target - p.speed), rate * dt) * Math.sign(target - p.speed);
    if (p.fuel <= 0) {
      p.throttle = 0;
      p.speed = Math.max(p.speed - 60 * dt, 40);
    }

    // Bank, heading and position.
    const bankTarget = input.turn * MAX_BANK;
    p.bank += (bankTarget - p.bank) * Math.min(1, dt * 4);
    p.heading += p.bank * TURN_RATE * dt;
    const prevZ = p.z;
    p.x += Math.sin(p.heading) * p.speed * dt;
    p.z += Math.cos(p.heading) * p.speed * dt;

    // Pitch and altitude.
    const climb = input.pitch > 0 ? CLIMB_RATE : SINK_RATE;
    const vy = input.pitch * climb * (0.4 + 0.6 * p.throttle)
      - (p.speed < MIN_SPEED + 20 ? 26 : 0);
    p.pitch = input.pitch * 0.35;
    p.y += vy * dt;

    // Fuel and the clock.
    p.fuel = Math.max(0, p.fuel - FUEL_BURN * (0.25 + p.throttle) * dt);
    if (!demo) state.timeLeft -= dt;

    // Rings: crossing the ring's plane inside its circle scores.
    const ring = RINGS[state.ringIndex];
    if (ring && prevZ < ring.z && p.z >= ring.z) {
      const d = Math.hypot(p.x - ring.x, p.y - ring.y);
      if (d < ring.r) {
        state.score += RING_POINTS + Math.round(state.timeLeft);
        state.ringsHit += 1;
        state.ringIndex += 1;
        events |= EVENT_RING;
      }
    }

    // Ground and the runway.
    const ground = terrainHeight(p.x, p.z);
    if (p.y <= ground + 6) {
      if (overRunway(p) && Math.abs(vy) < 45 && p.speed < 210) {
        state.status = 'landed';
        state.landed = true;
        state.score += LANDING_BONUS + Math.round(p.fuel * 2) + Math.round(state.timeLeft);
        state.message = 'Landed! Runway bonus earned.';
        events |= EVENT_LAND | EVENT_OVER;
      } else {
        state.status = 'crashed';
        state.message = p.y <= 2 ? 'Crashed into the ground.' : 'Clipped the terrain.';
        events |= EVENT_CRASH | EVENT_OVER;
      }
      p.y = ground + 6;
    }

    if (p.fuel <= 0 && p.y <= ground + 6 && state.status === 'flying') {
      state.status = 'crashed';
      state.message = 'Out of fuel.';
      events |= EVENT_CRASH | EVENT_OVER;
    }
    if (state.timeLeft <= 0 && state.status === 'flying') {
      state.status = 'timeout';
      state.message = 'Time up. The course is still open.';
      events |= EVENT_OVER;
    }
    return events;
  }

  return {
    state, clouds, trees, town, step, reset, terrainHeight,
    ring: () => RINGS[state.ringIndex] ?? null,
    ringsLeft: () => RINGS.length - state.ringIndex,
  };
}
