// A tiny seeded random generator, so clouds, trees and the town look the
// same for a given seed and screenshots are reproducible.
export function createRandom(seed) {
  let state = (seed >>> 0) || 1;
  function next() {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  }
  function range(min, max) {
    return min + (max - min) * next();
  }
  function pick(list) {
    return list[Math.floor(next() * list.length)];
  }
  return { next, range, pick };
}
