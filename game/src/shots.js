// Screenshot staging: ?shot=start|play|end (&seed=N) paints one fixed
// scene instead of running the loop, so the screenshots are reproducible.
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

export function stageShot(name, world) {
  const s = world.state;
  if (name === 'start') {
    world.reset();
    return { screen: SCREEN_TITLE, best: 0 };
  }
  if (name === 'play') {
    world.reset();
    const p = s.plane;
    p.x = 60; p.y = 330; p.z = 1350; p.heading = 0.08; p.speed = 230;
    p.bank = 0.18; p.throttle = 0.75; p.fuel = 78;
    s.score = 250; s.ringIndex = 1; s.ringsHit = 1; s.timeLeft = 108;
    return { screen: SCREEN_PLAY, best: 250 };
  }
  // end: landed on the runway.
  world.reset();
  const p = s.plane;
  p.x = 0; p.y = 8; p.z = 4800; p.heading = 0; p.speed = 0; p.throttle = 0;
  p.fuel = 41;
  s.score = 1240; s.ringIndex = 5; s.ringsHit = 5; s.timeLeft = 42;
  s.status = 'landed'; s.landed = true;
  s.message = 'Landed! Runway bonus earned.';
  return { screen: SCREEN_OVER, best: 1240 };
}
