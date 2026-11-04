# TrapGrid

A static, two-player blindfold floor game with a Supercell character theme.

One player — the **Watcher** — sees the whole trap map on screen. The other player — the **Runner** — wears a blindfold, stands on a physical 10 × 4 grid drawn on the floor, and moves only on the Watcher's calls. Traps exist only on the screen and in the generator; they are never marked on the floor.

The page opens directly into a generated round. There is no setup screen. **New grid** forges a fresh, unique 10 × 4 arena. The board auto-sizes to fill the viewport, so the entire grid stays visible without page scrolling.

## Run it

No build step, framework, package install, or external asset is needed for the game itself.

Open `index.html` directly in a modern browser, or serve the folder locally:

```powershell
npx serve .
```

or:

```powershell
python -m http.server 8000
```

Serving is recommended because `localStorage` behaves more consistently over `http://` than `file://`. The page works offline once the files are local.

## The arena

- Fixed grid: **10 columns × 4 rows** (40 tiles).
- Start: **A1**, the near-left corner.
- Goal: **J4**, the far-right corner.
- Columns letter left → right; rows number from the near side upward.
- Trap target: **30%** of the 34 trap-eligible tiles (**10 traps** nominally). The forge uses the smallest trap count that works — **10 to 12 in practice** — and only raises it as lower-count layouts are used up.
- **Straight-line rule:** no straight run of safe tiles longer than **three** in any row or column, so routes always turn. A diagonal limit is available but off by default, because enforcing it on a four-row arena funnels almost every route through the middle two rows.
- Start, Goal, and the two orthogonal entrance tiles around each are always kept clear.

## How to play

1. Draw the 10 × 4 grid on the floor. Mark Start at A1 and Goal at J4. Never mark traps.
2. The Runner wears a blindfold and stands on A1. The Watcher keeps the screen.
3. The Watcher calls moves one tile at a time: forwards, backwards, left, or right. No diagonals.
4. The Watcher can click each tile the Runner steps on, or use the arrow keys, to trace the route. The clock starts on the first move.
5. Stepping on a trap records a hit and marks it as spent. Reaching J4 clears the round.
6. **Reset route** restarts the attempt on the same map and swaps the backdrop. **New grid** generates a new map and a new backdrop.

Suggested penalties are up to the group: added time, lost lives, a dare, or a reset. The page records time, moves, and trap hits.

## Feasible by construction

- A four-way breadth-first search verifies a trap-free route from A1 to J4.
- **Straight-line rule:** every generated layout is checked for runs of four or more safe tiles in rows and columns. Set `maxDiagonalRun` to apply the same limit to both diagonal directions.
- For the line-limited arena, the core enumerates every line-compliant layout at each candidate trap count and samples one uniformly, so the rule is exact rather than best-effort.
- The trap count starts at the 10-trap target, then moves within ±2, then steps upward (up to +3) only when a count has no unused layouts left.
- If the line-limited space is unavailable, a guaranteed fallback first carves a trap-free route, then fills the remaining eligible tiles with the target trap count.
- The density is capped at 45% in the core generator.
- Tests independently run a second breadth-first search and an independent straight-line check over every generated grid, so the generator cannot pass by trusting its own path or line results.

## Never repeats

- Every round uses a fresh **160-bit crypto-random seed**.
- A **monotonic round counter** is stored alongside the grid.
- Each layout gets a **128-bit fingerprint** derived from the dimensions and every trap position.
- Fingerprints are stored in `localStorage` and checked before a grid is accepted. A duplicate is rejected and regenerated. Up to 50,000 fingerprints are written per browser.
- On the line-limited 10 × 4 arena the rule leaves a large, well-spread layout space: about **84 solvable layouts at 11 traps, 1,535 at 12, and 10,352 at 13**. The forge works through them lowest-trap-count first and raises the count as they are consumed.
- If a size exhausts its unique layout space, the app refuses to serve a repeat. **Reset route** intentionally keeps the current map while swapping the backdrop; **New grid** always creates a new fingerprint.

Local history is per browser and per origin. Clearing site data or switching devices resets stored history, but the 128-bit fingerprint and 160-bit seed make duplication practically impossible.

## Character figures

The floating figures flanking the board are built from the supplied character images:

- Archer
- Bowler
- Hog Rider
- Knight
- Prince

Asset layout:

```
assets/
  archer.jpg, bowler.jpg, hogrider.jpg, knight.jpg, prince.jpg  originals
  logo.jpg, logo.png                                           supplied logo and transparent header version
  Bomb7.webp … Tornado_Trap1.webp                               actual trap artwork used in the grid
  hd/bg1.webp … hd/bg6.webp                                    HD backdrop files
  cutouts/                                                       transparent PNG cutouts
  figures/                                                       self-contained SVG figures
tools/prepare_figures.py                                         cutout + SVG pipeline
```

Each `assets/figures/*.svg` wraps its transparent cutout as an embedded base64 PNG, so the SVG is self-contained and works from `file://`. On wide screens the SVGs sit in two large side rails flanking the board; on narrow screens they move into compact rows above it, and on very short viewports they hide so the grid can use the available height. CSS handles the gold aura, soft shadow, and bobbing animation.

## Trap artwork

The grid uses the six supplied WebP trap images: **Bomb**, **Giant Bomb**, **Air Bomb**, **Seeking Air Mine**, **Skeleton Trap**, and **Tornado Trap**. Each trap tile renders its corresponding image directly, and the core trap set matches those six types.

## Logo and backdrops

The transparent header logo is `assets/logo.png`, derived from the supplied `assets/logo.jpg`. It sits in a dark gold-bordered badge so the white Supercell wordmark stays readable over the backdrop.

The six supplied HD backdrops in `assets/hd/` are used one at a time as a crisp fixed backdrop with no blur. The grid has no surrounding container; the board floats directly on the backdrop.

The backdrop advances whenever the grid is reset:

- **New grid** and **Forge next grid** generate a new round and the next backdrop.
- **Reset route** restarts the current attempt and advances the backdrop.
- A page load counts as a new round, so it also advances.

Only one backdrop is active at a time. The current index is stored in `localStorage` and all backdrops are preloaded so the switch is immediate. To change the set used by the page, edit the `BACKGROUNDS` array in `js/app.js`; the CSS scene variable updates automatically.

## Rebuilding or adding figures

The asset pipeline is optional and separate from the static page. Install its dependencies:

```powershell
pip install pillow rembg
```

Then run:

```powershell
python tools/prepare_figures.py
```

The script removes backgrounds, crops, resizes, writes `assets/cutouts/*.png`, and regenerates `assets/figures/*.svg`. The first run downloads the background-removal model. `hogrider` uses the `u2net` model because the default model clips the grey hammer head; the other images use `isnet-general-use`.

To add a new character:

1. Drop a new JPG into `assets/`.
2. Add its name to `CHARACTERS` and `LABELS` in `tools/prepare_figures.py`, plus an optional model override in `MODEL_BY_NAME`.
3. Run the script. The logo and backdrop files are not processed.
4. Add an `<img src="assets/figures/yourname.svg" alt="">` figure to `.figure-layer` in `index.html`.
5. Add a matching position block in `styles.css` and include it in the mobile strip.

## Features

- 10 × 4 arena with a guaranteed, winding safe route — no straight safe run longer than three tiles in any row or column (diagonal limit optional).
- Supplied Supercell logo in the header.
- Six HD backdrops, one active at a time, rotating on every reset.
- No grid container: the board floats directly on the backdrop.
- Five larger cutout character figures flanking the board on wide screens.
- Coordinate-labelled trap map with player token and actual trap artwork.
- Click-to-trace movement and arrow-key control; diagonal moves rejected.
- Automatic timer, move count, trap-hit count, and spent-trap state.
- Win screen with score, stars, time, moves, and trap hits.
- Team login with name and PIN; cleared grids save automatically to the signed-in team.
- Leaderboard of all teams on the device, ranked by total score.
- Full-viewport, grid-first layout: the board auto-sizes so the entire 10 × 4 grid is visible without scrolling.
- Responsive layout: compact header and controls; figures move above the board on narrow screens and hide on short screens.
- Settings no longer exist; round number, uniqueness history, teams, scores, and the signed-in session persist in `localStorage`.
- No network requests, external fonts, frameworks, or image CDNs.

## Project structure

```
index.html                  page structure
styles.css                  theme, side figures, board and responsive styles
js/core.js                  seeded generation, pathfinding, fingerprints (browser + Node)
js/app.js                   UI, timer, tracking, storage and modals
assets/                     source art, logo, HD backdrops, trap art, cutouts and SVG figures
tools/prepare_figures.py    optional background-removal and SVG pipeline
tests/core.test.js          feasibility, uniqueness and fixed-arena tests
readme.md                   this file
```

## Testing

```powershell
node --test tests/core.test.js
```

Node 18+ is required for the built-in test runner. The suite covers:

- independent safe-route verification across sizes and difficulties;
- the straight-line rule (rows and columns by default, diagonals when requested) on the arena and other four-row sizes;
- Start/Goal and entrance safety;
- exact trap target counts and valid trap types;
- uniqueness across thousands of generated layouts;
- the fixed 10 × 4 arena across 250 rounds;
- seed reproducibility and rejection of seen fingerprints;
- tiny-board exhaustion handling;
- density and dimension clamps;
- coordinate helpers and fingerprint behavior.

## Safety

- Clear the floor and keep a spotter beside the Runner.
- Walk at a controlled pace; do not run.
- The Watcher can pause or stop the run at any time.
- Never mark trap positions on the physical floor.
- In the dark or with a blindfold, take extra care with footwear, edges, and nearby furniture.

## Optional scoring

The win screen calculates a casual score:

```
max(0, 500 + area × 4 − seconds × 2 − moves × 3 − hits × 120)
```

Three stars require a run with no trap hits. Groups can ignore this scoring completely and use their own rules.

## Teams, scores, and leaderboard

- **Team login** — the **Team login** button in the header opens a sign-in sheet. A team is a name (2–24 characters) plus a PIN (4–16 characters). **Create team** registers a new team; **Sign in** unlocks an existing one. The signed-in team is remembered in `localStorage`, so reloading the page keeps the session. **Switch team** and **Sign out** live in the same modal.
- **Scoring** — when a signed-in team clears a grid, the run (score, stars, time, moves, hits, grid ID) is saved to that team automatically. The win screen confirms the save and shows the team's running total. Wins scored while signed out are held briefly; logging in from the win screen claims that run, while resetting or forging a new grid drops it.
- **Leaderboard** — the **Leaderboard** button ranks every team on the device by total score (best run, then name, as tie-breaks), showing runs, best, and total. The current team's row is highlighted, and rank 1 gets the gold rank.

Teams, runs (last 200 per team), and the session are stored in `localStorage` under `trapgrid.teams.v1` and `trapgrid.session.v1`. The PIN is stored as a salted hash, not in plain text, but this is a local party game on a shared device — treat team data as visible to anyone with access to the browser. Data is per browser and per origin, like the rest of the game's history.

## Notes

This is a fan-made party game. Character artwork, backdrops, the Supercell logo, and Clash of Clans are property of Supercell. It is not affiliated with or endorsed by Supercell. The visual assets in `assets/` were supplied for this project; the cutouts and SVG wrappers are derived from those supplied images.
