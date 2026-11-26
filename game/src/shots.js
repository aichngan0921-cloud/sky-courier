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
    p.x = 40; p.y = 340; p.z = 1050; p.heading = 0.10; p.speed = 230;
    p.bank = 0.18; p.throttle = 0.75; p.fuel = 78;
    s.score = 250; s.ringIndex = 1; s.ringsHit = 1; s.timeLeft = 108;
    return { screen: SCREEN_PLAY, best: 250 };
  }
  // end: on final approach to the runway, about to touch down.
  world.reset();
  const p = s.plane;
  p.x = 0; p.y = 55; p.z = 4550; p.heading = 0; p.speed = 120; p.throttle = 0.2;
  p.fuel = 41;
  s.score = 1240; s.ringIndex = 5; s.ringsHit = 5; s.timeLeft = 42;
  s.status = 'landed'; s.landed = true;
  s.message = 'Landed! Runway bonus earned.';
  return { screen: SCREEN_OVER, best: 1240 };
}
