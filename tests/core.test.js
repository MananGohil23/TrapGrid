'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../js/core.js');

function hasSafeRoute(grid) {
  const { rows, cols, traps, start, goal } = grid;
  const visited = new Uint8Array(rows * cols);
  const queue = [start.r * cols + start.c];
  visited[queue[0]] = 1;

  for (let head = 0; head < queue.length; head += 1) {
    const index = queue[head];
    if (index === goal.r * cols + goal.c) {
      return true;
    }
    const row = Math.floor(index / cols);
    const col = index % cols;
    const neighbours = [
      [row - 1, col],
      [row + 1, col],
      [row, col - 1],
      [row, col + 1]
    ];

    for (const [nextRow, nextCol] of neighbours) {
      if (nextRow < 0 || nextRow >= rows || nextCol < 0 || nextCol >= cols) {
        continue;
      }
      const next = nextRow * cols + nextCol;
      if (!visited[next] && !traps[next]) {
        visited[next] = 1;
        queue.push(next);
      }
    }
  }

  return false;
}

function assertFeasible(grid, label) {
  assert.ok(grid, label + ': grid exists');
  assert.equal(grid.verified, true, label + ': verified flag');
  assert.ok(grid.path, label + ': path returned');
  assert.ok(grid.path.length > 0, label + ': path is not empty');
  assert.equal(grid.path[0].r, grid.start.r, label + ': path starts at start');
  assert.equal(grid.path[0].c, grid.start.c, label + ': path starts at start');
  const end = grid.path[grid.path.length - 1];
  assert.equal(end.r, grid.goal.r, label + ': path ends at goal');
  assert.equal(end.c, grid.goal.c, label + ': path ends at goal');
  assert.equal(hasSafeRoute(grid), true, label + ': independent BFS finds route');
  assert.equal(grid.traps[grid.start.r * grid.cols + grid.start.c], 0, label + ': start is safe');
  assert.equal(grid.traps[grid.goal.r * grid.cols + grid.goal.c], 0, label + ': goal is safe');

  for (const cell of grid.path) {
    assert.equal(grid.traps[cell.r * grid.cols + cell.c], 0, label + ': path cell is safe');
  }

  let trapCount = 0;
  for (let i = 0; i < grid.traps.length; i += 1) {
    if (grid.traps[i]) {
      trapCount += 1;
      assert.ok(grid.types[i] >= 0, label + ': every trap has a type');
      assert.ok(grid.types[i] < Core.TRAP_TYPES.length, label + ': trap type is valid');
    } else {
      assert.equal(grid.types[i], -1, label + ': safe tile has no trap type');
    }
  }
  assert.equal(trapCount, grid.trapCount, label + ': trap count matches');
  assert.equal(grid.safeCount, grid.rows * grid.cols - trapCount, label + ': safe count matches');
  assert.ok(grid.actualDensity > 0 && grid.actualDensity < 0.5, label + ': density is playable');
  assert.match(grid.fingerprint, /^[0-9a-f]{32}$/, label + ': fingerprint is 128-bit hex');

  const startNeighbourA = grid.traps[(grid.start.r - 1) * grid.cols + grid.start.c];
  const startNeighbourB = grid.traps[grid.start.r * grid.cols + grid.start.c + 1];
  const goalNeighbourA = grid.traps[(grid.goal.r + 1) * grid.cols + grid.goal.c];
  const goalNeighbourB = grid.traps[grid.goal.r * grid.cols + grid.goal.c - 1];
  assert.equal(Boolean(startNeighbourA), false, label + ': start entrance is clear');
  assert.equal(Boolean(startNeighbourB), false, label + ': start entrance is clear');
  assert.equal(Boolean(goalNeighbourA), false, label + ': goal entrance is clear');
  assert.equal(Boolean(goalNeighbourB), false, label + ': goal entrance is clear');
}

function maxStraightSafeRun(grid) {
  const directions = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1]
  ];
  let worst = 0;

  for (const [dr, dc] of directions) {
    for (let r = 0; r < grid.rows; r += 1) {
      for (let c = 0; c < grid.cols; c += 1) {
        const prevR = r - dr;
        const prevC = c - dc;
        if (prevR >= 0 && prevR < grid.rows && prevC >= 0 && prevC < grid.cols) {
          continue;
        }
        let run = 0;
        let rr = r;
        let cc = c;
        while (rr >= 0 && rr < grid.rows && cc >= 0 && cc < grid.cols) {
          if (grid.traps[rr * grid.cols + cc]) {
            worst = Math.max(worst, run);
            run = 0;
          } else {
            run += 1;
          }
          rr += dr;
          cc += dc;
        }
        worst = Math.max(worst, run);
      }
    }
  }

  return worst;
}

function assertLineLimited(grid, limit, label) {
  assert.equal(grid.maxSafeRun, limit, label + ': grid reports the line limit');
  assert.ok(
    maxStraightSafeRun(grid) <= limit,
    label + ': no straight safe run longer than ' + limit
  );
}

test('every generated grid has a verified safe route', () => {
  const sizes = [
    [4, 4],
    [5, 9],
    [6, 6],
    [7, 7],
    [8, 8],
    [10, 10],
    [14, 14],
    [4, 14],
    [14, 4]
  ];

  for (const [rows, cols] of sizes) {
    for (const difficulty of Object.values(Core.DIFFICULTIES)) {
      for (let i = 0; i < 12; i += 1) {
        const grid = Core.generate({
          rows,
          cols,
          density: difficulty.density,
          minDetour: difficulty.minDetour,
          seed: `feasible-${rows}-${cols}-${difficulty.id}-${i}`
        });
        assertFeasible(grid, `${rows}x${cols} ${difficulty.id} #${i}`);
      }
    }
  }
});

test('trap estimate matches normal generated layout counts', () => {
  for (const [rows, cols] of [
    [6, 6],
    [7, 7],
    [8, 8],
    [10, 10]
  ]) {
    for (const difficulty of Object.values(Core.DIFFICULTIES)) {
      const estimate = Core.estimateTraps(rows, cols, difficulty.density);
      let expectedCount = 0;
      for (let i = 0; i < 8; i += 1) {
        const grid = Core.generate({
          rows,
          cols,
          density: difficulty.density,
          minDetour: difficulty.minDetour,
          seed: `count-${rows}-${cols}-${difficulty.id}-${i}`
        });
        if (!grid.carved) {
          expectedCount += 1;
          assert.equal(
            grid.trapCount,
            estimate,
            `${rows}x${cols} ${difficulty.id}: exact trap target`
          );
        }
      }
      assert.ok(expectedCount > 0, 'some normal (non-carved) grids were generated');
    }
  }
});

test('a large batch of generated grids never repeats', () => {
  const seen = new Set();
  const sizes = [
    [4, 4],
    [6, 6],
    [7, 7],
    [8, 8],
    [10, 10],
    [14, 14]
  ];

  for (const [rows, cols] of sizes) {
    for (const difficulty of Object.values(Core.DIFFICULTIES)) {
      for (let i = 0; i < 60; i += 1) {
        const grid = Core.generate({
          rows,
          cols,
          density: difficulty.density,
          minDetour: difficulty.minDetour,
          seed: `unique-${rows}-${cols}-${difficulty.id}-${i}`,
          seen
        });
        assertFeasible(grid, `${rows}x${cols} ${difficulty.id} unique #${i}`);
        assert.equal(
          seen.has(grid.fingerprint),
          false,
          `${rows}x${cols} ${difficulty.id}: no duplicate fingerprint`
        );
        seen.add(grid.fingerprint);
      }
    }
  }

  assert.equal(seen.size, sizes.length * 3 * 60);
});

test('the same seed is reproducible when the layout is unseen', () => {
  const options = {
    rows: 8,
    cols: 8,
    density: Core.DIFFICULTIES.normal.density,
    minDetour: Core.DIFFICULTIES.normal.minDetour,
    seed: 'reproducible-seed'
  };
  const first = Core.generate(options);
  const second = Core.generate(options);
  assert.equal(first.fingerprint, second.fingerprint);
  assert.deepEqual(Array.from(first.traps), Array.from(second.traps));
  assert.deepEqual(Array.from(first.types), Array.from(second.types));
});

test('seen fingerprints force a fresh layout with the same seed', () => {
  const options = {
    rows: 8,
    cols: 8,
    density: Core.DIFFICULTIES.normal.density,
    minDetour: Core.DIFFICULTIES.normal.minDetour,
    seed: 'same-seed-new-grid'
  };
  const first = Core.generate(options);
  const seen = new Set([first.fingerprint]);
  const second = Core.generate({ ...options, seen });

  assert.notEqual(first.fingerprint, second.fingerprint);
  assertFeasible(second, 'seen collision replacement');
});

test('tiny boards keep producing unique layouts when heavily reused', () => {
  const seen = new Set();
  for (let i = 0; i < 80; i += 1) {
    const grid = Core.generate({
      rows: 4,
      cols: 4,
      density: Core.DIFFICULTIES.easy.density,
      minDetour: 0,
      seed: `tiny-${i}`,
      seen
    });
    assertFeasible(grid, `tiny #${i}`);
    assert.equal(seen.has(grid.fingerprint), false, `tiny #${i}: unique`);
    seen.add(grid.fingerprint);
  }
});

test('density and dimensions are clamped to safe limits', () => {
  assert.equal(Core.generate({ rows: 1, cols: 1, density: 5 }).rows, Core.LIMITS.minRows);
  assert.equal(Core.generate({ rows: 99, cols: 99, density: 5 }).cols, Core.LIMITS.maxCols);
  const grid = Core.generate({ rows: 8, cols: 8, density: 0.99, seed: 'clamp' });
  assert.ok(grid.targetDensity <= Core.LIMITS.maxDensity);
  assert.ok(grid.actualDensity <= Core.LIMITS.maxDensity + 0.01);
});

test('the fixed 10x4 arena always produces a feasible unique layout', () => {
  const seen = new Set();
  const expectedTraps = Core.estimateTraps(4, 10, 0.3);

  for (let i = 0; i < 250; i += 1) {
    const grid = Core.generate({
      rows: 4,
      cols: 10,
      density: 0.3,
      minDetour: 1,
      maxSafeRun: 3,
      seed: `arena-${i}`,
      seen
    });
    assertFeasible(grid, `arena #${i}`);
    assert.equal(grid.rows, 4);
    assert.equal(grid.cols, 10);
    assert.ok(
      grid.trapCount >= expectedTraps - 2 && grid.trapCount <= expectedTraps + 5,
      `arena #${i}: trap count stays near target (got ${grid.trapCount})`
    );
    assertLineLimited(grid, 3, `arena #${i}`);
    assert.equal(seen.has(grid.fingerprint), false, `arena #${i}: unique`);
    seen.add(grid.fingerprint);
  }

  assert.equal(seen.size, 250);
});

test('line-limited generation works on other four-row arenas', () => {
  const seen = new Set();

  for (let i = 0; i < 40; i += 1) {
    const grid = Core.generate({
      rows: 4,
      cols: 12,
      density: 0.3,
      minDetour: 1,
      maxSafeRun: 3,
      seed: `wide-${i}`,
      seen
    });
    assertFeasible(grid, `wide #${i}`);
    assertLineLimited(grid, 3, `wide #${i}`);
    assert.equal(seen.has(grid.fingerprint), false, `wide #${i}: unique`);
    seen.add(grid.fingerprint);
  }

  assert.equal(seen.size, 40);
});

test('line limit is opt-in and absent by default', () => {
  const grid = Core.generate({
    rows: 8,
    cols: 8,
    density: Core.DIFFICULTIES.normal.density,
    minDetour: Core.DIFFICULTIES.normal.minDetour,
    seed: 'no-line-limit'
  });
  assert.equal(grid.maxSafeRun, 0);
  assertFeasible(grid, 'unconstrained');
});

test('coordinate helpers are stable', () => {
  assert.equal(Core.colName(0), 'A');
  assert.equal(Core.colName(7), 'H');
  assert.equal(Core.colName(25), 'Z');
  assert.equal(Core.colName(26), 'AA');
  assert.equal(Core.coordOf(8, 7, 0), 'A1');
  assert.equal(Core.coordOf(8, 0, 7), 'H8');
  assert.equal(Core.coordOf(7, 3, 3), 'D4');
});

test('fingerprints include grid dimensions and trap positions', () => {
  const a = new Uint8Array(36);
  const b = new Uint8Array(36);
  a[0] = 1;
  b[0] = 1;
  assert.equal(Core.fingerprintLayout(6, 6, a), Core.fingerprintLayout(6, 6, b));
  b[1] = 1;
  assert.notEqual(Core.fingerprintLayout(6, 6, a), Core.fingerprintLayout(6, 6, b));
  assert.notEqual(Core.fingerprintLayout(6, 6, a), Core.fingerprintLayout(7, 6, a));
});
