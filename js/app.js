(function () {
  'use strict';

  const Core = window.TrapGridCore;
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const ARENA = Object.freeze({ rows: 4, cols: 10, density: 0.43, minDetour: 3, maxSafeRun: 3 });

  const TRAP_IMAGES = {
    bomb: 'assets/Bomb7.webp',
    giant: 'assets/Giant_Bomb5.webp',
    air: 'assets/Air_Bomb7.webp',
    mine: 'assets/Seeking_Air_Mine3.webp',
    skeleton: 'assets/SkeletonTrap3_Ground.webp',
    tornado: 'assets/Tornado_Trap1.webp'
  };

  const STORAGE = {
    round: 'trapgrid.round.v1',
    seen: 'trapgrid.seen.v1',
    background: 'trapgrid.background.v1'
  };

  const BACKGROUNDS = [
    'assets/hd/bg1.webp',
    'assets/hd/bg2.webp',
    'assets/hd/bg3.webp',
    'assets/hd/bg4.webp',
    'assets/hd/bg5.webp',
    'assets/hd/bg6.webp'
  ];

  let backgroundIndex = -1;

  const READY_MESSAGE = 'Click a tile to start the clock.';

  const state = {
    grid: null,
    current: null,
    cells: [],
    token: null,
    timerId: null,
    timerStarted: false,
    runningSince: null,
    elapsedBase: 0,
    finalElapsed: null,
    finished: false,
    moves: 0,
    hits: 0,
    triggered: new Set(),
    toastTimer: null,
    lastFocused: null,
    lastResult: null
  };

  let seenSet = new Set(
    (readStorage(STORAGE.seen, []) || []).filter(function (value) {
      return typeof value === 'string';
    })
  );

  let roundCounter = (function () {
    const stored = Number(readStorage(STORAGE.round, 0));
    return Number.isFinite(stored) && stored > 0 ? Math.floor(stored) : 0;
  })();

  const el = {};
  [
    'topRound',
    'timer',
    'moveCount',
    'hitCount',
    'statusText',
    'statusMessage',
    'newGridBtn',
    'board',
    'winModal',
    'winStars',
    'winSub',
    'winStats',
    'winId',
    'winNextBtn',
    'toast'
  ].forEach(function (id) {
    el[id] = document.getElementById(id);
  });

  function readStorage(key, fallback) {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw === null) {
        return fallback;
      }
      return JSON.parse(raw);
    } catch (error) {
      return fallback;
    }
  }

  function writeStorage(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      return false;
    }
  }

  function persistSeen() {
    let values = Array.from(seenSet);
    if (values.length > 50000) {
      values = values.slice(-50000);
    }
    writeStorage(STORAGE.seen, values);
  }

  function computeScore(grid, seconds, moves, hits) {
    const score = Math.max(
      0,
      500 + grid.rows * grid.cols * 4 - seconds * 2 - moves * 3 - hits * 120
    );
    let stars = 1;
    if (hits === 0) {
      stars = 3;
    } else if (hits <= 2) {
      stars = 2;
    }
    return { score: score, stars: stars };
  }

  function advanceBackground() {
    const stored = Number(readStorage(STORAGE.background, backgroundIndex));
    const current = Number.isFinite(stored) ? Math.floor(stored) : backgroundIndex;
    backgroundIndex = (((current + 1) % BACKGROUNDS.length) + BACKGROUNDS.length) % BACKGROUNDS.length;
    writeStorage(STORAGE.background, backgroundIndex);
    document.documentElement.style.setProperty(
      '--scene-image',
      'url("' + BACKGROUNDS[backgroundIndex] + '")'
    );
    const next = (backgroundIndex + 1) % BACKGROUNDS.length;
    const image = new Image();
    image.src = BACKGROUNDS[next];
  }

  function nextRoundNumber() {
    const stored = Number(readStorage(STORAGE.round, 0));
    const highest = Number.isFinite(stored) && stored > 0 ? Math.floor(stored) : 0;
    roundCounter = Math.max(roundCounter, highest) + 1;
    writeStorage(STORAGE.round, roundCounter);
    return roundCounter;
  }

  function padRound(value) {
    return String(value).padStart(4, '0');
  }

  function makeGridId(grid, round) {
    return (
      'TG-' +
      grid.cols +
      'x' +
      grid.rows +
      '-' +
      padRound(round) +
      '-' +
      grid.fingerprint.slice(0, 8).toUpperCase()
    );
  }

  function formatTime(milliseconds) {
    const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
  }

  function setStatus(kind, message) {
    if (!el.statusText || !el.statusMessage) {
      return;
    }
    el.statusText.className = 'status' + (kind ? ' ' + kind : '');
    el.statusMessage.textContent = message;
  }

  function elapsedMs() {
    if (state.finalElapsed !== null) {
      return state.finalElapsed;
    }
    return (
      state.elapsedBase +
      (state.runningSince !== null ? performance.now() - state.runningSince : 0)
    );
  }

  function updateTimerDisplay() {
    el.timer.textContent = formatTime(elapsedMs());
  }

  function beginTimer() {
    if (state.finished) {
      return;
    }
    state.timerStarted = true;
    if (state.runningSince === null) {
      state.runningSince = performance.now();
      if (state.timerId) {
        window.clearInterval(state.timerId);
      }
      state.timerId = window.setInterval(updateTimerDisplay, 250);
    }
    updateTimerDisplay();
  }

  function pauseTimer() {
    if (state.runningSince !== null) {
      state.elapsedBase += performance.now() - state.runningSince;
      state.runningSince = null;
    }
    if (state.timerId) {
      window.clearInterval(state.timerId);
      state.timerId = null;
    }
    updateTimerDisplay();
  }

  function updateHud() {
    el.moveCount.textContent = String(state.moves);
    el.hitCount.textContent = String(state.hits);
  }

  function resetRoundState() {
    if (state.timerId) {
      window.clearInterval(state.timerId);
      state.timerId = null;
    }
    state.timerStarted = false;
    state.runningSince = null;
    state.elapsedBase = 0;
    state.finalElapsed = null;
    state.finished = false;
    state.moves = 0;
    state.hits = 0;
    state.triggered.clear();
    state.lastResult = null;
    if (state.grid) {
      state.current = { ...state.grid.start };
    }
  }

  function forgeGrid(options) {
    const silent = Boolean(options && options.silent);
    const storedSeen = readStorage(STORAGE.seen, []);
    if (Array.isArray(storedSeen)) {
      storedSeen.forEach(function (fingerprint) {
        if (typeof fingerprint === 'string') {
          seenSet.add(fingerprint);
        }
      });
    }

    let grid;
    try {
      grid = Core.generate({
        rows: ARENA.rows,
        cols: ARENA.cols,
        density: ARENA.density,
        minDetour: ARENA.minDetour,
        maxSafeRun: ARENA.maxSafeRun,
        seed: Core.randomSeed(),
        seen: seenSet
      });
    } catch (error) {
      console.error(error);
      toast('The forge jammed. Try generating again.', 'danger');
      return false;
    }

    if (!grid.unique) {
      toast('No unused 10 × 4 layouts remain on this device. Clear old round data to continue.', 'danger', 5200);
      return false;
    }

    const round = nextRoundNumber();
    seenSet.add(grid.fingerprint);
    persistSeen();
    advanceBackground();

    state.grid = {
      ...grid,
      round: round,
      gridId: makeGridId(grid, round)
    };

    renderGame();

    if (!silent) {
      toast(
        'Round ' +
          padRound(round) +
          ' forged · ' +
          grid.trapCount +
          ' traps · layout ' +
          grid.fingerprint.slice(0, 6).toUpperCase(),
        'success'
      );
    }

    return true;
  }

  function renderGame() {
    const grid = state.grid;
    if (!grid) {
      return;
    }

    el.topRound.textContent = grid.cols + ' × ' + grid.rows + ' · Round ' + padRound(grid.round);

    resetRoundState();
    renderBoard();
    updateHud();
    updateTimerDisplay();
    setStatus('', READY_MESSAGE);
    hideModal('winModal');
    document.body.classList.remove('modal-open');
  }

  function renderBoard() {
    const grid = state.grid;
    const rows = grid.rows;
    const cols = grid.cols;
    const total = rows * cols;
    const fragment = document.createDocumentFragment();

    el.board.innerHTML = '';
    el.board.style.setProperty('--cols', String(cols));
    el.board.style.setProperty('--rows', String(rows));
    el.board.style.gridTemplateColumns = 'auto repeat(' + cols + ', minmax(0, 1fr))';

    const corner = document.createElement('span');
    corner.className = 'axis axis-corner';
    corner.textContent = '·';
    corner.style.gridColumn = '1';
    corner.style.gridRow = '1';
    corner.title = 'Columns A → J; rows ↑ from the start side';
    fragment.appendChild(corner);

    for (let c = 0; c < cols; c += 1) {
      const label = document.createElement('span');
      label.className = 'axis axis-top';
      label.textContent = Core.colName(c);
      label.style.gridColumn = String(c + 2);
      label.style.gridRow = '1';
      fragment.appendChild(label);
    }

    for (let r = 0; r < rows; r += 1) {
      const label = document.createElement('span');
      label.className = 'axis axis-side';
      label.textContent = String(rows - r);
      label.style.gridColumn = '1';
      label.style.gridRow = String(r + 2);
      fragment.appendChild(label);
    }

    state.cells = new Array(total);

    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const index = r * cols + c;
        const coord = Core.coordOf(rows, r, c);
        const isTrap = Boolean(grid.traps[index]);
        const typeIndex = isTrap ? grid.types[index] : -1;
        const trapType = typeIndex >= 0 ? Core.TRAP_TYPES[typeIndex] : null;
        const isStart = r === grid.start.r && c === grid.start.c;
        const isGoal = r === grid.goal.r && c === grid.goal.c;
        const button = document.createElement('button');

        button.type = 'button';
        button.className = 'cell';
        if ((r + c) % 2 === 1) {
          button.classList.add('alt');
        }
        button.style.gridColumn = String(c + 2);
        button.style.gridRow = String(r + 2);
        button.dataset.r = String(r);
        button.dataset.c = String(c);

        if (isTrap && trapType) {
          button.classList.add('trap');
          button.dataset.trap = trapType.id;
          button.title = coord + ' — ' + trapType.name + ': ' + trapType.blurb;
          button.setAttribute('aria-label', coord + ' — ' + trapType.name + ' trap');
          const image = document.createElement('img');
          image.className = 'trap-icon';
          image.src = TRAP_IMAGES[trapType.id];
          image.alt = '';
          image.draggable = false;
          button.appendChild(image);
        } else {
          button.title = coord + ' — safe tile';
          button.setAttribute('aria-label', coord + ' — safe tile');
        }

        if (isStart) {
          button.classList.add('start');
          button.title = coord + ' — start tile';
          button.setAttribute('aria-label', coord + ' — start tile');
          button.appendChild(svgUse('icon-start', 'cell-emblem'));
          const tag = document.createElement('span');
          tag.className = 'tile-tag';
          tag.textContent = 'START';
          button.appendChild(tag);
        }

        if (isGoal) {
          button.classList.add('goal');
          button.title = coord + ' — goal tile';
          button.setAttribute('aria-label', coord + ' — goal tile');
          button.appendChild(svgUse('icon-flag', 'cell-emblem'));
          const tag = document.createElement('span');
          tag.className = 'tile-tag';
          tag.textContent = 'GOAL';
          button.appendChild(tag);
        }

        state.cells[index] = button;
        fragment.appendChild(button);
      }
    }

    el.board.appendChild(fragment);

    state.token = document.createElement('span');
    state.token.className = 'player-token';
    state.token.setAttribute('aria-hidden', 'true');
    state.token.appendChild(svgUse('icon-runner'));

    const startCell = state.cells[grid.start.r * cols + grid.start.c];
    if (startCell) {
      startCell.appendChild(state.token);
    }
  }

  function svgUse(symbolId, className) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    if (className) {
      svg.setAttribute('class', className);
    }
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const use = document.createElementNS(SVG_NS, 'use');
    use.setAttribute('href', '#' + symbolId);
    svg.appendChild(use);
    return svg;
  }

  function placeToken(cell) {
    if (!cell || !state.token) {
      return;
    }
    state.token.classList.remove('hop');
    cell.appendChild(state.token);
    void state.token.offsetWidth;
    state.token.classList.add('hop');
  }

  function moveTo(row, col) {
    const grid = state.grid;
    if (!grid || state.finished) {
      return;
    }
    if (row < 0 || row >= grid.rows || col < 0 || col >= grid.cols) {
      return;
    }

    const index = row * grid.cols + col;
    const typeIndex = grid.types[index];
    const trapType = typeIndex >= 0 ? Core.TRAP_TYPES[typeIndex] : null;
    const cell = state.cells[index];
    const coord = Core.coordOf(grid.rows, row, col);
    const goal = Core.coordOf(grid.rows, grid.goal.r, grid.goal.c);

    beginTimer();
    state.current = { r: row, c: col };
    state.moves += 1;
    placeToken(cell);
    updateHud();

    if (trapType) {
      if (!state.triggered.has(index)) {
        state.triggered.add(index);
        state.hits += 1;
        cell.classList.add('detonated');
        cell.classList.remove('boom');
        void cell.offsetWidth;
        cell.classList.add('boom');
        window.setTimeout(function () {
          cell.classList.remove('boom');
        }, 570);
        updateHud();
        toast('BOOM — ' + trapType.name + ' at ' + coord + '. Hit ' + state.hits + '.', 'danger');
        setStatus(
          'danger',
          'BOOM — ' +
            trapType.name +
            ' at ' +
            coord +
            ' · ' +
            state.hits +
            ' hit' +
            (state.hits === 1 ? '' : 's') +
            ' · goal ' +
            goal
        );
      } else {
        toast('Spent trap — ' + trapType.name + ' at ' + coord + ' is already triggered.');
        setStatus('live', 'Runner at ' + coord + ' · ' + state.moves + ' moves · goal ' + goal);
      }
    } else {
      setStatus(
        'live',
        'Runner at ' +
          coord +
          ' · ' +
          state.moves +
          ' move' +
          (state.moves === 1 ? '' : 's') +
          ' · ' +
          state.hits +
          ' hit' +
          (state.hits === 1 ? '' : 's') +
          ' · goal ' +
          goal
      );
    }

    if (row === grid.goal.r && col === grid.goal.c) {
      finishRound();
    }

    try {
      el.board.focus({ preventScroll: true });
    } catch (error) {
      el.board.focus();
    }
  }

  function finishRound() {
    if (state.finished) {
      return;
    }
    pauseTimer();
    state.finished = true;
    state.finalElapsed = state.elapsedBase;
    updateTimerDisplay();
    setStatus('success', 'Goal reached — grid cleared in ' + formatTime(state.finalElapsed) + '!');
    updateHud();

    if (state.grid) {
      const seconds = Math.round((state.finalElapsed || 0) / 1000);
      const outcome = computeScore(state.grid, seconds, state.moves, state.hits);
      state.lastResult = {
        score: outcome.score,
        stars: outcome.stars,
        seconds: seconds,
        moves: state.moves,
        hits: state.hits
      };
    }

    window.setTimeout(function () {
      if (state.finished && state.grid) {
        openWinModal();
      }
    }, 460);
  }

  function openWinModal() {
    const grid = state.grid;
    if (!grid) {
      return;
    }
    const seconds = Math.round((state.finalElapsed || 0) / 1000);
    const result =
      state.lastResult || computeScore(grid, seconds, state.moves, state.hits);
    const score = result.score;
    const stars = result.stars;

    let subtitle;
    if (stars === 3) {
      subtitle = 'Flawless. No traps triggered — the Watcher earns a crown.';
    } else if (state.hits <= 2) {
      subtitle = 'A few scrapes, but the flag is yours.';
    } else {
      subtitle = 'Grid cleared. The traps definitely noticed you.';
    }

    el.winSub.textContent = subtitle;
    el.winStars.innerHTML = '';
    el.winStars.setAttribute('role', 'img');
    el.winStars.setAttribute('aria-label', stars + ' of 3 stars');
    for (let i = 0; i < 3; i += 1) {
      const star = svgUse('icon-star');
      if (i < stars) {
        star.classList.add('on');
      }
      el.winStars.appendChild(star);
    }

    el.winStats.innerHTML = '';
    el.winStats.appendChild(makeWinStat(score, 'Score'));
    el.winStats.appendChild(makeWinStat(formatTime(state.finalElapsed || 0), 'Time'));
    el.winStats.appendChild(makeWinStat(state.moves, 'Moves'));
    el.winStats.appendChild(makeWinStat(state.hits, 'Trap hits'));

    el.winId.textContent = 'ID ' + grid.gridId + ' · fingerprint ' + grid.fingerprint;
    showModal('winModal');
  }

  function makeWinStat(value, label) {
    const box = document.createElement('div');
    box.className = 'win-stat';
    const number = document.createElement('span');
    number.textContent = String(value);
    const caption = document.createElement('small');
    caption.textContent = label;
    box.appendChild(number);
    box.appendChild(caption);
    return box;
  }

  function showModal(id) {
    const modal = document.getElementById(id);
    if (!modal) {
      return;
    }
    state.lastFocused = document.activeElement;
    modal.hidden = false;
    document.body.classList.add('modal-open');
    const focusTarget = modal.querySelector('.btn-primary, .modal-x, .btn');
    if (focusTarget) {
      focusTarget.focus({ preventScroll: true });
    }
  }

  function hideModal(id) {
    const modal = document.getElementById(id);
    if (!modal || modal.hidden) {
      return;
    }
    modal.hidden = true;
    const anyOpen = Array.from(document.querySelectorAll('.modal')).some(function (candidate) {
      return !candidate.hidden;
    });
    if (!anyOpen) {
      document.body.classList.remove('modal-open');
      if (state.lastFocused && typeof state.lastFocused.focus === 'function') {
        try {
          state.lastFocused.focus({ preventScroll: true });
        } catch (error) {
          state.lastFocused.focus();
        }
      }
    }
  }

  function toast(message, kind, duration) {
    if (!el.toast) {
      return;
    }
    el.toast.textContent = message;
    el.toast.className = 'toast show' + (kind ? ' ' + kind : '');
    if (state.toastTimer) {
      window.clearTimeout(state.toastTimer);
    }
    state.toastTimer = window.setTimeout(function () {
      el.toast.className = 'toast' + (kind ? ' ' + kind : '');
      state.toastTimer = null;
    }, duration || 2800);
  }

  function handleBoardClick(event) {
    const cell = event.target.closest('.cell');
    if (!cell || !state.grid) {
      return;
    }
    const row = Number(cell.dataset.r);
    const col = Number(cell.dataset.c);

    if (state.finished) {
      toast('Grid already cleared. Forge a new one or inspect the map.');
      return;
    }

    if (row === state.current.r && col === state.current.c) {
      if (!state.timerStarted) {
        beginTimer();
        setStatus('live', 'Clock running. Guide the Runner to the goal tile.');
        toast('Clock started — guide the Runner!', 'success');
      } else if (state.runningSince === null) {
        beginTimer();
        setStatus('live', 'Clock resumed. Guide the Runner to the goal tile.');
        toast('Clock resumed.', 'success');
      } else {
        toast('The Runner is already standing here.');
      }
      return;
    }

    const distance = Math.abs(row - state.current.r) + Math.abs(col - state.current.c);
    if (distance !== 1) {
      toast('One tile at a time — no diagonal moves.', 'danger');
      return;
    }
    moveTo(row, col);
  }

  function handleBoardKeydown(event) {
    const directions = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1]
    };
    const direction = directions[event.key];
    if (!direction) {
      return;
    }
    event.preventDefault();
    if (!state.grid || !state.current || state.finished) {
      return;
    }
    const nextRow = state.current.r + direction[0];
    const nextCol = state.current.c + direction[1];
    if (nextRow < 0 || nextRow >= state.grid.rows || nextCol < 0 || nextCol >= state.grid.cols) {
      toast('Edge of the grid.', 'danger');
      return;
    }
    moveTo(nextRow, nextCol);
  }

  function bindEvents() {
    el.board.addEventListener('click', handleBoardClick);
    el.board.addEventListener('keydown', handleBoardKeydown);

    el.newGridBtn.addEventListener('click', function () {
      forgeGrid();
    });

    el.winNextBtn.addEventListener('click', function () {
      hideModal('winModal');
      forgeGrid();
    });

    document.querySelectorAll('[data-close]').forEach(function (trigger) {
      trigger.addEventListener('click', function () {
        hideModal(trigger.dataset.close);
      });
    });

    document.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape') {
        return;
      }
      const openModals = Array.from(document.querySelectorAll('.modal')).filter(function (modal) {
        return !modal.hidden;
      });
      if (openModals.length) {
        hideModal(openModals[openModals.length - 1].id);
      }
    });

    document.addEventListener('visibilitychange', function () {
      if (document.hidden && state.timerStarted && !state.finished && state.runningSince !== null) {
        pauseTimer();
        setStatus('live', 'Round paused while the tab was hidden · next move resumes the clock.');
      }
    });
  }

  function init() {
    if (!Core) {
      console.error('TrapGrid core failed to load.');
      return;
    }
    bindEvents();
    if (window.CloudLoader) CloudLoader.hookReset(['newGridBtn', 'winNextBtn']);
    forgeGrid({ silent: true });
    updateTimerDisplay();
  }

  init();
})();

