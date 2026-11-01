# TrapGrid

A static, two-player blindfold floor game with a Supercell character theme.

One player — the **Watcher** — sees the whole trap map on screen. The other player — the **Runner** — wears a blindfold, stands on a physical 10 × 4 grid drawn on the floor, and moves only on the Watcher's calls. Traps exist only on the screen and in the generator; they are never marked on the floor.

The page opens directly into a generated round. There is no setup screen. **New grid** forges a fresh, unique 10 × 4 arena.

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
- Trap density: **30%** of the 34 trap-eligible tiles, which targets **10 traps** per round.
- Start, Goal, and the two orthogonal entrance tiles around each are always kept clear.

## How to play

1. Draw the 10 × 4 grid on the floor. Mark Start at A1 and Goal at J4. Never mark traps.
2. The Runner wears a blindfold and stands on A1. The Watcher keeps the screen.
3. The Watcher calls moves one tile at a time: forwards, backwards, left, or right. No diagonals.
4. The Watcher can click each tile the Runner steps on, or use the arrow keys, to trace the route. The clock starts on the first move.
5. Stepping on a trap records a hit and marks it as spent. Reaching J4 clears the round.
6. **Reveal safe route** shows the shortest safe path as a hint. **Reset route** restarts the attempt on the same map and swaps the backdrop. **New grid** generates a new map and a new backdrop.

Suggested penalties are up to the group: added time, lost lives, a dare, or a reset. The page records time, moves, trap hits, and hints used.

## Feasible by construction

- A four-way breadth-first search verifies a trap-free route from A1 to J4.
- Candidate layouts that block the route are rejected and regenerated.
- If random retries cannot find a valid layout, a guaranteed fallback first carves a trap-free route, then fills the remaining eligible tiles with the target trap count.
- The trap target is exact in normal generation. The density is capped at 45% in the core generator.
- Tests independently run a second breadth-first search over every generated grid, so the generator cannot pass by trusting its own path result.

## Never repeats

- Every round uses a fresh **160-bit crypto-random seed**.
- A **monotonic round counter** is stored alongside the grid.
- Each layout gets a **128-bit fingerprint** derived from the dimensions and every trap position.
- Fingerprints are stored in `localStorage` and checked before a grid is accepted. A duplicate is rejected and regenerated. Up to 50,000 fingerprints are written per browser.
- If a size exhausts its unique layout space, the app refuses to serve a repeat. **Reset route** intentionally keeps the current map while swapping the backdrop; **New grid** always creates a new fingerprint.

Local history is per browser and per origin. Clearing site data or switching devices resets stored history, but the 128-bit fingerprint and 160-bit seed make duplication practically impossible.

## Character figures

The floating figures around the board are built from the supplied character images:

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
  bg1.jpg … bg5.jpg                                            original backdrop sources
  hd/bg1.webp … hd/bg5.webp                                    1920 × 1080 backdrop files
  cutouts/                                                       transparent PNG cutouts
  figures/                                                       self-contained SVG figures
tools/prepare_figures.py                                         cutout + SVG pipeline
tools/prepare_backdrops.py                                       HD backdrop pipeline
```

Each `assets/figures/*.svg` wraps its transparent cutout as an embedded base64 PNG, so the SVG is self-contained and works from `file://`. The page places the SVGs in a floating figure layer above and below the board. CSS handles the gold aura, soft shadow, bobbing animation, and the compact mobile character strip.

## Logo and backdrops

The transparent header logo is `assets/logo.png`, derived from the supplied `assets/logo.jpg`. It sits in a dark gold-bordered badge so the white Supercell wordmark stays readable over the backdrop.

The five supplied backdrops are used one at a time. The original JPGs are cropped to 16:9, upscaled to **1920 × 1080**, lightly sharpened, and saved as WebP files in `assets/hd/`. The page uses those HD files as a crisp fixed backdrop with no blur. The arena/grid container has a frosted-glass finish: a translucent dark tint and backdrop blur let the backdrop show through without hurting readability.

The backdrop advances whenever the grid is reset:

- **New grid** and **Forge next grid** generate a new round and the next backdrop.
- **Reset route** restarts the current attempt and advances the backdrop.
- A page load counts as a new round, so it also advances.

Only one backdrop is active at a time. The current index is stored in `localStorage` and all backdrops are preloaded so the switch is immediate. To regenerate the HD set after replacing a source JPG, run:

```powershell
pip install pillow
python tools/prepare_backdrops.py
```

To change the set used by the page, edit the `BACKGROUNDS` array in `js/app.js`; the CSS scene variable updates automatically.

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

- 10 × 4 arena with a guaranteed safe route.
- Supplied Supercell logo in the header.
- Five HD 1920 × 1080 backdrops, one active at a time, rotating on every reset.
- Frosted-glass grid container so the backdrop stays partly visible.
- Five cutout character figures floating around the board.
- Coordinate-labelled trap map with player token, trap icons, and type counts.
- Click-to-trace movement and arrow-key control; diagonal moves rejected.
- Automatic timer, move count, trap-hit count, and spent-trap state.
- Optional shortest-safe-route reveal, counted as a hint.
- Win screen with score, stars, time, moves, and trap hits.
- Copyable round record with ID, fingerprint, and status.
- Responsive layout: floating figures around the board on desktop, character strip on mobile.
- Settings no longer exist; round number and uniqueness history persist in `localStorage`.
- No network requests, external fonts, frameworks, or image CDNs.

## Project structure

```
index.html                  page structure and inline SVG trap artwork
styles.css                  theme, glass arena, floating figures, board and responsive styles
js/core.js                  seeded generation, pathfinding, fingerprints (browser + Node)
js/app.js                   UI, timer, tracking, storage, modals and copy
assets/                     source art, logo, backdrops (originals + HD), cutouts and SVG figures
tools/prepare_figures.py    optional background-removal and SVG pipeline
tools/prepare_backdrops.py  optional HD backdrop crop/upscale pipeline
tests/core.test.js          feasibility, uniqueness and fixed-arena tests
readme.md                   this file
```

## Testing

```powershell
node --test tests/core.test.js
```

Node 18+ is required for the built-in test runner. The suite covers:

- independent safe-route verification across sizes and difficulties;
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
max(0, 500 + area × 4 − seconds × 2 − moves × 3 − hits × 120 − hints × 90)
```

Three stars require a run with no trap hits and no route hints. Groups can ignore this scoring completely and use their own rules.

## Notes

This is a fan-made party game. Character artwork, backdrops, the Supercell logo, and Clash of Clans are property of Supercell. It is not affiliated with or endorsed by Supercell. The visual assets in `assets/` were supplied for this project; the cutouts and SVG wrappers are derived from those supplied images.
