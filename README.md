# Sky Courier — Ring Run

A make.fun entry for the `best-flight-game-20261126-0057` competition: a
chase-view flight game that plays offline in a desktop browser from static
files.

Fly the plane through five glowing rings over hills, a river and a town,
then land on the runway before the fuel or the clock runs out. Arrows or
WASD steer and climb, Shift opens the throttle, X closes it, P pauses.

- `game/` — the playable game (`index.html` + ES modules under `src/`)
- `screenshots/` — 3 real renders of the game's own code (play, title, landed)
- `main.ts` — hands the game in: copies `game/` and `screenshots/` to
  `/output` and writes `/output/dossier.json` with the vendored library
- `vendor/makefun-game.ts` — the kit's library, unchanged

Serve locally with `node serve.ts` and open http://localhost:8080.
`?shot=start|play|end&seed=N` stages one fixed scene for a screenshot.
