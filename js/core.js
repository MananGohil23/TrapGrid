(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && typeof module.exports === 'object') {
    module.exports = api;
  }
  if (root) {
    root.TrapGridCore = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const TRAP_TYPES = Object.freeze([
    {
      id: 'bomb',
      name: 'Bomb',
      blurb: 'A classic hidden explosive. Small, rude, and everywhere.'
    },
    {
      id: 'spring',
      name: 'Spring Trap',
      blurb: 'Flings troops clean off the board.'
    },
    {
      id: 'giant',
      name: 'Giant Bomb',
      blurb: 'One huge blast. Very little warning.'
    },
    {
      id: 'air',
      name: 'Air Bomb',
      blurb: 'A nasty surprise for anything that flies.'
    },
    {
      id: 'mine',
      name: 'Seeking Air Mine',
      blurb: 'Locks on and refuses to miss.'
    },
    {
      id: 'skeleton',
      name: 'Skeleton Trap',
      blurb: 'Releases a very unfriendly skeleton crew.'
    },
    {
      id: 'tornado',
      name: 'Tornado Trap',
      blurb: 'Spins troops in circles until they give up.'
    }
  ]);

  const TYPE_WEIGHTS = Object.freeze([30, 18, 12, 14, 10, 8, 8]);
  const TYPE_WEIGHT_TOTAL = TYPE_WEIGHTS.reduce(function (sum, weight) {
    return sum + weight;
  }, 0);

  const DIFFICULTIES = Object.freeze({
    easy: Object.freeze({
      id: 'easy',
      label: 'Recruit',
      density: 0.18,
      minDetour: 0,
      blurb: 'Forgiving first run'
    }),
    normal: Object.freeze({
      id: 'normal',
      label: 'Veteran',
      density: 0.27,
      minDetour: 1,
      blurb: 'The sweet spot'
    }),
    hard: Object.freeze({
      id: 'hard',
      label: 'Master',
      density: 0.36,
      minDetour: 3,
      blurb: 'Narrow routes, big detours'
    })
  });

  const LIMITS = Object.freeze({
    minRows: 2,
    maxRows: 20,
    minCols: 2,
    maxCols: 20,
    minDensity: 0.05,
    maxDensity: 0.45,
    maxAttemptsPerSeed: 260,
    maxSeedsPerPhase: 8,
    carveAttempts: 120
  });

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function toInt(value, fallback) {
    const number = Math.floor(Number(value));
    return Number.isFinite(number) ? number : fallback;
  }

  function randomSeed(byteLength) {
    const length = clamp(toInt(byteLength, 20), 8, 64);
    const bytes = new Uint8Array(length);
    const cryptoObject = typeof crypto !== 'undefined' ? crypto : null;

    if (cryptoObject && typeof cryptoObject.getRandomValues === 'function') {
      cryptoObject.getRandomValues(bytes);
    } else {
      for (let i = 0; i < length; i += 1) {
        bytes[i] = Math.floor(Math.random() * 256);
      }
    }

    let output = '';
    for (let i = 0; i < bytes.length; i += 1) {
      output += bytes[i].toString(16).padStart(2, '0');
    }
    return output;
  }

  function mix32(value) {
    let x = value >>> 0;
    x ^= x >>> 16;
    x = Math.imul(x, 0x7feb352d);
    x ^= x >>> 15;
    x = Math.imul(x, 0x846ca68b);
    x ^= x >>> 16;
    return x >>> 0;
  }

  function hash128(text) {
    const input = String(text);
    let h1 = 0x811c9dc5;
    let h2 = 0x9e3779b9;
    let h3 = 0x85ebca6b;
    let h4 = 0xc2b2ae35;

    for (let i = 0; i < input.length; i += 1) {
      const code = input.charCodeAt(i);
      h1 = Math.imul(h1 ^ code, 0x01000193);
      h2 = Math.imul(h2 ^ code, 0x27d4eb2d);
      h3 = Math.imul(h3 ^ code, 0x165667b1);
      h4 = Math.imul(h4 ^ code, 0x9e3779b1);
    }

    return [h1, h2, h3, h4]
      .map(function (lane) {
        return mix32(lane).toString(16).padStart(8, '0');
      })
      .join('');
  }

  function xmur3(text) {
    let hash = 1779033703 ^ text.length;
    for (let i = 0; i < text.length; i += 1) {
      hash = Math.imul(hash ^ text.charCodeAt(i), 3432918353);
      hash = (hash << 13) | (hash >>> 19);
    }
    return function () {
      hash = Math.imul(hash ^ (hash >>> 16), 2246822507);
      hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
      hash ^= hash >>> 16;
      return hash >>> 0;
    };
  }

  function sfc32(a, b, c, d) {
    return function () {
      let sum = (a + b) | 0;
      sum = (sum + d) | 0;
      d = (d + 1) | 0;
      a = b ^ (b >>> 9);
      b = (c + (c << 3)) | 0;
      c = (c << 21) | (c >>> 11);
      c = (c + sum) | 0;
      return (sum >>> 0) / 4294967296;
    };
  }

  function makeRng(seed) {
    const hash = xmur3(String(seed));
    return sfc32(hash(), hash(), hash(), hash());
  }

  function colName(index) {
    let value = Math.max(0, Math.floor(index));
    let name = '';
    do {
      name = String.fromCharCode(65 + (value % 26)) + name;
      value = Math.floor(value / 26) - 1;
    } while (value >= 0);
    return name;
  }

  function coordOf(rows, row, col) {
    return colName(col) + String(rows - row);
  }

  function startAndGoal(rows, cols) {
    return {
      start: { r: rows - 1, c: 0 },
      goal: { r: 0, c: cols - 1 }
    };
  }

  function protectedIndexes(rows, cols) {
    const points = startAndGoal(rows, cols);
    const protectedSet = new Set();

    function add(r, c) {
      if (r >= 0 && r < rows && c >= 0 && c < cols) {
        protectedSet.add(r * cols + c);
      }
    }

    add(points.start.r, points.start.c);
    add(points.start.r - 1, points.start.c);
    add(points.start.r, points.start.c + 1);
    add(points.goal.r, points.goal.c);
    add(points.goal.r + 1, points.goal.c);
    add(points.goal.r, points.goal.c - 1);

    return protectedSet;
  }

  function freeTileCount(rows, cols) {
    const safeRows = clamp(toInt(rows, 8), LIMITS.minRows, LIMITS.maxRows);
    const safeCols = clamp(toInt(cols, 8), LIMITS.minCols, LIMITS.maxCols);
    return safeRows * safeCols - protectedIndexes(safeRows, safeCols).size;
  }

  function estimateTraps(rows, cols, density) {
    const safeRows = clamp(toInt(rows, 8), LIMITS.minRows, LIMITS.maxRows);
    const safeCols = clamp(toInt(cols, 8), LIMITS.minCols, LIMITS.maxCols);
    const safeDensity = clamp(Number(density) || 0.27, LIMITS.minDensity, LIMITS.maxDensity);
    const available = safeRows * safeCols - protectedIndexes(safeRows, safeCols).size;
    return Math.max(0, Math.round(available * safeDensity));
  }

  function shortestPath(traps, rows, cols, start, goal) {
    const total = rows * cols;
    const startIndex = start.r * cols + start.c;
    const goalIndex = goal.r * cols + goal.c;

    if (traps[startIndex] || traps[goalIndex]) {
      return null;
    }

    const previous = new Int32Array(total);
    previous.fill(-1);
    const visited = new Uint8Array(total);
    const queue = new Int32Array(total);
    let head = 0;
    let tail = 0;

    visited[startIndex] = 1;
    queue[tail] = startIndex;
    tail += 1;

    while (head < tail) {
      const index = queue[head];
      head += 1;

      if (index === goalIndex) {
        break;
      }

      const row = (index / cols) | 0;
      const col = index - row * cols;

      if (row > 0) {
        const next = index - cols;
        if (!visited[next] && !traps[next]) {
          visited[next] = 1;
          previous[next] = index;
          queue[tail] = next;
          tail += 1;
        }
      }
      if (col < cols - 1) {
        const next = index + 1;
        if (!visited[next] && !traps[next]) {
          visited[next] = 1;
          previous[next] = index;
          queue[tail] = next;
          tail += 1;
        }
      }
      if (row < rows - 1) {
        const next = index + cols;
        if (!visited[next] && !traps[next]) {
          visited[next] = 1;
          previous[next] = index;
          queue[tail] = next;
          tail += 1;
        }
      }
      if (col > 0) {
        const next = index - 1;
        if (!visited[next] && !traps[next]) {
          visited[next] = 1;
          previous[next] = index;
          queue[tail] = next;
          tail += 1;
        }
      }
    }

    if (!visited[goalIndex]) {
      return null;
    }

    const path = [];
    let cursor = goalIndex;
    while (cursor !== -1) {
      const row = (cursor / cols) | 0;
      path.push({ r: row, c: cursor - row * cols });
      if (cursor === startIndex) {
        break;
      }
      cursor = previous[cursor];
    }
    path.reverse();
    return path;
  }

  function fingerprintLayout(rows, cols, traps) {
    let bits = '';
    for (let i = 0; i < traps.length; i += 1) {
      bits += traps[i] ? '1' : '0';
    }
    return hash128(rows + 'x' + cols + '|' + bits);
  }

  function pickTrapType(rng) {
    let roll = rng() * TYPE_WEIGHT_TOTAL;
    for (let i = 0; i < TYPE_WEIGHTS.length; i += 1) {
      roll -= TYPE_WEIGHTS[i];
      if (roll < 0) {
        return i;
      }
    }
    return TRAP_TYPES.length - 1;
  }

  function assignTrapTypes(traps, rng) {
    const types = new Int8Array(traps.length);
    types.fill(-1);
    for (let i = 0; i < traps.length; i += 1) {
      if (traps[i]) {
        types[i] = pickTrapType(rng);
      }
    }
    return types;
  }

  function countTraps(traps) {
    let count = 0;
    for (let i = 0; i < traps.length; i += 1) {
      count += traps[i] ? 1 : 0;
    }
    return count;
  }

  function finalize(options) {
    const rows = options.rows;
    const cols = options.cols;
    const traps = options.traps;
    const rng = options.rng;
    const path = options.path;
    const points = startAndGoal(rows, cols);
    const trapCount = countTraps(traps);

    return {
      rows: rows,
      cols: cols,
      start: points.start,
      goal: points.goal,
      traps: traps,
      types: assignTrapTypes(traps, rng),
      path: path,
      trapCount: trapCount,
      safeCount: rows * cols - trapCount,
      actualDensity: trapCount / (rows * cols),
      targetDensity: options.density,
      fingerprint: options.fingerprint,
      seed: options.seedUsed,
      attempts: options.attempts,
      carved: Boolean(options.carved),
      unique: options.unique !== false,
      verified: true
    };
  }

  function randomMonotonePath(rng, rows, cols, start, goal) {
    let row = start.r;
    let col = start.c;
    const cells = [{ r: row, c: col }];

    while (row !== goal.r || col !== goal.c) {
      const canGoUp = row > goal.r;
      const canGoRight = col < goal.c;
      let goUp;

      if (canGoUp && canGoRight) {
        goUp = rng() < 0.5;
      } else {
        goUp = canGoUp;
      }

      if (goUp) {
        row -= 1;
      } else {
        col += 1;
      }
      cells.push({ r: row, c: col });
    }

    return cells;
  }

  function generate(options) {
    const settings = options || {};
    const rows = clamp(toInt(settings.rows, 8), LIMITS.minRows, LIMITS.maxRows);
    const cols = clamp(toInt(settings.cols, 8), LIMITS.minCols, LIMITS.maxCols);
    const rawDensity = Number(settings.density);
    const density = clamp(
      Number.isFinite(rawDensity) ? rawDensity : 0.27,
      LIMITS.minDensity,
      LIMITS.maxDensity
    );
    const rawDetour = Number(settings.minDetour);
    const minDetour = Math.max(
      0,
      Math.floor(Number.isFinite(rawDetour) ? rawDetour : 0)
    );
    const seed = settings.seed ? String(settings.seed) : randomSeed();
    const seen =
      settings.seen instanceof Set
        ? settings.seen
        : new Set(Array.isArray(settings.seen) ? settings.seen : []);
    const points = startAndGoal(rows, cols);
    const start = points.start;
    const goal = points.goal;
    const protectedSet = protectedIndexes(rows, cols);
    const total = rows * cols;
    const freeTiles = total - protectedSet.size;
    const targetTraps = Math.max(1, Math.round(freeTiles * density));
    const eligibleTiles = [];
    for (let i = 0; i < total; i += 1) {
      if (!protectedSet.has(i)) {
        eligibleTiles.push(i);
      }
    }
    const manhattan = rows - 1 + (cols - 1);
    let attempts = 0;

    function placeExactTraps(rng, pool) {
      const traps = new Uint8Array(total);
      const wanted = Math.min(targetTraps, pool.length);

      for (let k = 0; k < wanted; k += 1) {
        const swapIndex = k + Math.floor(rng() * (pool.length - k));
        const chosen = pool[k];
        pool[k] = pool[swapIndex];
        pool[swapIndex] = chosen;
        traps[pool[k]] = 1;
      }

      return traps;
    }

    function tryRandomLayout(rng, requiredDetour) {
      attempts += 1;
      const traps = placeExactTraps(rng, eligibleTiles.slice());

      const path = shortestPath(traps, rows, cols, start, goal);
      if (!path) {
        return null;
      }

      if (path.length - 1 < manhattan + requiredDetour) {
        return null;
      }

      const fingerprint = fingerprintLayout(rows, cols, traps);
      if (seen.has(fingerprint)) {
        return null;
      }

      return { traps: traps, path: path, fingerprint: fingerprint };
    }

    const phases = minDetour > 0 ? [minDetour, 0] : [0];

    for (let p = 0; p < phases.length; p += 1) {
      const requiredDetour = phases[p];

      for (let s = 0; s < LIMITS.maxSeedsPerPhase; s += 1) {
        const seedUsed = seed + '|d' + requiredDetour + '|s' + s;
        const rng = makeRng(seedUsed);

        for (let a = 0; a < LIMITS.maxAttemptsPerSeed; a += 1) {
          const candidate = tryRandomLayout(rng, requiredDetour);
          if (candidate) {
            return finalize({
              rows: rows,
              cols: cols,
              traps: candidate.traps,
              rng: rng,
              path: candidate.path,
              fingerprint: candidate.fingerprint,
              seedUsed: seedUsed,
              density: density,
              attempts: attempts,
              carved: false
            });
          }
        }
      }
    }

    const fallbackTargets = [targetTraps];
    for (let delta = 1; delta <= 5; delta += 1) {
      fallbackTargets.push(targetTraps + delta);
      fallbackTargets.push(targetTraps - delta);
    }

    for (let t = 0; t < fallbackTargets.length; t += 1) {
      const fallbackTarget = fallbackTargets[t];
      if (fallbackTarget < 1 || fallbackTarget > eligibleTiles.length) {
        continue;
      }

      for (
        let s = 0;
        s < Math.max(16, Math.ceil(LIMITS.carveAttempts / fallbackTargets.length));
        s += 1
      ) {
        attempts += 1;
        const seedUsed =
          s % 2 === 0
            ? seed + '|carve|' + fallbackTarget + '|' + s
            : randomSeed(16);
        const rng = makeRng(seedUsed);
        const carvedPath = randomMonotonePath(rng, rows, cols, start, goal);
        const carvedSet = new Set(
          carvedPath.map(function (cell) {
            return cell.r * cols + cell.c;
          })
        );

        const pool = [];
        for (let i = 0; i < total; i += 1) {
          if (!protectedSet.has(i) && !carvedSet.has(i)) {
            pool.push(i);
          }
        }

        const traps = new Uint8Array(total);
        const wanted = Math.min(fallbackTarget, pool.length);
        for (let k = 0; k < wanted; k += 1) {
          const swapIndex = k + Math.floor(rng() * (pool.length - k));
          const chosen = pool[k];
          pool[k] = pool[swapIndex];
          pool[swapIndex] = chosen;
          traps[pool[k]] = 1;
        }

        const path = shortestPath(traps, rows, cols, start, goal);
        if (!path) {
          continue;
        }

        const fingerprint = fingerprintLayout(rows, cols, traps);
        if (seen.has(fingerprint)) {
          continue;
        }

        return finalize({
          rows: rows,
          cols: cols,
          traps: traps,
          rng: rng,
          path: path,
          fingerprint: fingerprint,
          seedUsed: seedUsed,
          density: density,
          attempts: attempts,
          carved: true
        });
      }
    }

    const empty = new Uint8Array(total);
    const fallbackPath = shortestPath(empty, rows, cols, start, goal);
    return finalize({
      rows: rows,
      cols: cols,
      traps: empty,
      rng: makeRng(seed + '|empty'),
      path: fallbackPath,
      fingerprint: fingerprintLayout(rows, cols, empty),
      seedUsed: seed + '|empty',
      density: density,
      attempts: attempts,
      carved: true,
      unique: false
    });
  }

  return {
    TRAP_TYPES: TRAP_TYPES,
    DIFFICULTIES: DIFFICULTIES,
    LIMITS: LIMITS,
    generate: generate,
    estimateTraps: estimateTraps,
    freeTileCount: freeTileCount,
    shortestPath: shortestPath,
    fingerprintLayout: fingerprintLayout,
    hash128: hash128,
    randomSeed: randomSeed,
    makeRng: makeRng,
    colName: colName,
    coordOf: coordOf,
    startAndGoal: startAndGoal
  };
});
