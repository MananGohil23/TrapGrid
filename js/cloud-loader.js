(function () {
  'use strict';

  const DEFAULTS = {
    cloudCount: 12,
    message: null,
    resetMessage: 'Preparing the grid\u2026',
    minHoldMs: 1500,
    resetHoldMs: 300,
    loadFailSafeMs: 8000,
    zIndex: 2147483000,
    durations: { cover: 950, reveal: 950, drift: 4.5 },
    colors: {
      cloud: '#ffffff',
      cloudSoft: '#dfe7f1',
      cloudEdge: '#bccbdd',
      shade: 'rgba(125, 150, 182, 0.42)',
      shadow: 'rgba(95, 120, 155, 0.24)',
      veil: '#e3ebf4',
      text: '#4c5f76'
    }
  };

  const config = JSON.parse(JSON.stringify(DEFAULTS));

  const state = {
    phase: 'idle',
    coveredAt: 0,
    overlay: null,
    messageText: null,
    layers: [],
    coverTimer: null,
    revealTimer: null,
    coverResolve: null,
    revealResolve: null,
    coverPromise: null,
    revealPromise: null,
    lock: null,
    chain: null,
    pendingRebuild: false,
    resizeTimer: null,
    bootHold: false
  };

  function now() {
    return typeof performance !== 'undefined' && performance.now
      ? performance.now()
      : Date.now();
  }

  function coverTotal() {
    return config.durations.cover + 140;
  }

  function revealTotal() {
    return config.durations.reveal * 1.05 + 140;
  }

  function reducedMotion() {
    return (
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }

  function buildOverlay() {
    if (state.overlay || !document.body) {
      return;
    }

    const overlay = document.createElement('div');
    overlay.className = 'cl-overlay';
    overlay.setAttribute('aria-hidden', 'true');

    const veil = document.createElement('div');
    veil.className = 'cl-veil';
    overlay.appendChild(veil);

    const layersWrap = document.createElement('div');
    layersWrap.className = 'cl-layers';
    state.layers = [0, 1, 2].map(function (index) {
      const layer = document.createElement('div');
      layer.className = 'cl-layer';
      layer.setAttribute('data-layer', String(index));
      layersWrap.appendChild(layer);
      return layer;
    });
    overlay.appendChild(layersWrap);

    const message = document.createElement('div');
    message.className = 'cl-message';
    message.setAttribute('role', 'status');
    message.setAttribute('aria-live', 'polite');

    const messageText = document.createElement('span');
    messageText.className = 'cl-message-text';
    message.appendChild(messageText);

    const dots = document.createElement('span');
    dots.className = 'cl-dots';
    dots.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 3; i += 1) {
      dots.appendChild(document.createElement('i'));
    }
    message.appendChild(dots);
    overlay.appendChild(message);

    state.overlay = overlay;
    state.messageText = messageText;
    document.body.appendChild(overlay);
  }

  function applyConfig() {
    if (!state.overlay) {
      return;
    }
    const overlay = state.overlay;
    const colors = config.colors;
    const durations = config.durations;

    overlay.style.setProperty('--cl-cloud', String(colors.cloud));
    overlay.style.setProperty('--cl-cloud-2', String(colors.cloudSoft));
    overlay.style.setProperty('--cl-cloud-edge', String(colors.cloudEdge));
    overlay.style.setProperty('--cl-shade', String(colors.shade));
    overlay.style.setProperty('--cl-shadow', String(colors.shadow));
    overlay.style.setProperty('--cl-veil', String(colors.veil));
    overlay.style.setProperty('--cl-text', String(colors.text));
    overlay.style.setProperty('--cl-cover-dur', Number(durations.cover) + 'ms');
    overlay.style.setProperty('--cl-reveal-dur', Number(durations.reveal) + 'ms');
    overlay.style.setProperty('--cl-drift-dur', Number(durations.drift) + 's');
    overlay.style.setProperty('--cl-z', String(config.zIndex));

    document.documentElement.style.setProperty('--cl-z', String(config.zIndex));
  }

  function buildClouds() {
    if (!state.overlay) {
      return;
    }

    const vw = window.innerWidth || document.documentElement.clientWidth || 320;
    const vh = window.innerHeight || document.documentElement.clientHeight || 480;
    const base = Math.max(4, Math.round(config.cloudCount));
    const counts = [Math.max(4, Math.round(base * 0.7)), base, Math.round(base * 1.35)];
    const sizes = [Math.max(240, vw * 0.5), Math.max(170, vw * 0.32), Math.max(120, vw * 0.2)];

    state.layers.forEach(function (layer, index) {
      layer.innerHTML = '';
      const count = counts[index];
      const size = sizes[index];
      const cols = Math.max(1, Math.ceil(Math.sqrt((count * vw) / Math.max(1, vh))));
      const rows = Math.max(1, Math.ceil(count / cols));

      for (let i = 0; i < count; i += 1) {
        const cloud = document.createElement('div');
        cloud.className = 'cl-cloud';

        const width = Math.round(size * (0.82 + Math.random() * 0.45));
        const height = Math.round(width * (0.5 + Math.random() * 0.12));
        const col = i % cols;
        const row = Math.floor(i / cols);
        const jitterX = (Math.random() - 0.5) * 0.8;
        const jitterY = (Math.random() - 0.5) * 0.8;
        const left = ((col + 0.5 + jitterX) / cols) * vw * 1.12 - vw * 0.06;
        const top = ((row + 0.5 + jitterY) / rows) * vh * 1.12 - vh * 0.06;

        const centerX = left + width / 2;
        const fromLeft = centerX <= vw / 2;
        const tx = fromLeft ? -(left + width + 60) : vw - left + 60;
        const ty = 0;

        const distance = Math.abs(tx);
        const delay = Math.min(100, Math.round((distance / 2400) * 100));

        cloud.style.left = left + 'px';
        cloud.style.top = top + 'px';
        cloud.style.width = width + 'px';
        cloud.style.height = height + 'px';
        cloud.style.setProperty('--cl-radius', Math.max(10, Math.min(42, Math.round(width * 0.08))) + 'px');
        cloud.style.zIndex = String(Math.round(20 + (1.3 - width / size) * 10));
        cloud.style.setProperty('--cl-tx', tx + 'px');
        cloud.style.setProperty('--cl-ty', ty + 'px');
        cloud.style.setProperty('--cl-delay', delay + 'ms');
        cloud.style.setProperty('--cl-drift-dur', (3.2 + Math.random() * 2.6).toFixed(2) + 's');
        cloud.style.setProperty('--cl-drift-delay', (-Math.random() * 4).toFixed(2) + 's');
        cloud.style.setProperty('--cl-dx', ((Math.random() - 0.5) * 14).toFixed(1) + 'px');
        cloud.style.setProperty('--cl-dy', ((Math.random() - 0.5) * 10).toFixed(1) + 'px');
        layer.appendChild(cloud);
      }
    });
  }

  function setMessage(options) {
    if (!state.overlay) {
      return;
    }
    const hasOwn = Object.prototype.hasOwnProperty;
    const message = hasOwn.call(options, 'message') ? options.message : config.message;
    if (message) {
      state.messageText.textContent = String(message);
      state.overlay.classList.add('cl-show-message');
    } else {
      state.messageText.textContent = '';
      state.overlay.classList.remove('cl-show-message');
    }
  }

  function lockScroll() {
    if (state.lock) {
      return;
    }
    const html = document.documentElement;
    const body = document.body;
    state.lock = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      x: window.pageXOffset || 0,
      y: window.pageYOffset || 0
    };
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
  }

  function unlockScroll() {
    if (!state.lock) {
      return;
    }
    document.documentElement.style.overflow = state.lock.htmlOverflow;
    document.body.style.overflow = state.lock.bodyOverflow;
    if (state.lock.x || state.lock.y) {
      window.scrollTo(state.lock.x, state.lock.y);
    }
    state.lock = null;
  }

  function cleanup() {
    if (!state.overlay) {
      return;
    }
    state.overlay.classList.remove(
      'cl-active',
      'cl-covered',
      'cl-revealing',
      'cl-fast',
      'cl-show-message',
      'cl-swirl'
    );
    state.overlay.setAttribute('aria-hidden', 'true');
    if (state.messageText) {
      state.messageText.textContent = '';
    }
    unlockScroll();

    if (state.pendingRebuild) {
      state.pendingRebuild = false;
      buildClouds();
    }
  }

  function finishCover() {
    if (state.phase !== 'covering') {
      return;
    }
    if (state.coverTimer) {
      window.clearTimeout(state.coverTimer);
      state.coverTimer = null;
    }
    state.phase = 'covered';
    state.coveredAt = now();
    state.overlay.classList.remove('cl-fast');

    const resolve = state.coverResolve;
    state.coverResolve = null;
    if (resolve) {
      resolve();
    }
  }

  function fastFinishCover() {
    if (state.phase !== 'covering' || !state.coverTimer) {
      return;
    }
    state.overlay.classList.add('cl-fast');
    window.clearTimeout(state.coverTimer);
    state.coverTimer = window.setTimeout(finishCover, 220);
  }

  function swirl() {
    state.overlay.classList.remove('cl-swirl');
    void state.overlay.offsetWidth;
    state.overlay.classList.add('cl-swirl');
    return new Promise(function (resolve) {
      window.setTimeout(function () {
        state.overlay.classList.remove('cl-swirl');
        resolve();
      }, 720);
    });
  }

  function recover() {
    if (state.revealTimer) {
      window.clearTimeout(state.revealTimer);
      state.revealTimer = null;
    }
    const staleReveal = state.revealResolve;
    state.revealResolve = null;
    if (staleReveal) {
      staleReveal();
    }

    state.phase = 'covering';
    state.overlay.classList.remove('cl-revealing');
    state.overlay.classList.add('cl-fast');
    void state.overlay.offsetWidth;
    state.overlay.classList.add('cl-covered');

    state.coverPromise = new Promise(function (resolve) {
      state.coverResolve = resolve;
    });
    state.coverTimer = window.setTimeout(finishCover, 240);
    return state.coverPromise;
  }

  function show(options) {
    const opts = options || {};

    if (!state.overlay) {
      init();
      if (!state.overlay) {
        return Promise.resolve();
      }
    }

    if (state.phase === 'covering' || state.phase === 'covered') {
      return swirl();
    }
    if (state.phase === 'revealing') {
      return recover();
    }

    state.bootHold = false;
    state.phase = 'covering';
    setMessage(opts);
    state.overlay.setAttribute('aria-hidden', 'false');
    state.overlay.classList.remove('cl-covered', 'cl-revealing', 'cl-fast', 'cl-swirl');
    state.overlay.classList.add('cl-active');
    void state.overlay.offsetWidth;
    state.overlay.classList.add('cl-covered');
    lockScroll();

    state.coverPromise = new Promise(function (resolve) {
      state.coverResolve = resolve;
    });
    state.coverTimer = window.setTimeout(finishCover, coverTotal());
    return state.coverPromise;
  }

  function startReveal() {
    if (state.phase !== 'covered') {
      return Promise.resolve();
    }
    state.phase = 'revealing';
    state.overlay.classList.remove('cl-covered');
    state.overlay.classList.add('cl-revealing');

    state.revealPromise = new Promise(function (resolve) {
      state.revealResolve = resolve;
    });
    state.revealTimer = window.setTimeout(function () {
      state.revealTimer = null;
      if (state.phase !== 'revealing') {
        return;
      }
      cleanup();
      state.phase = 'idle';
      const resolve = state.revealResolve;
      state.revealResolve = null;
      if (resolve) {
        resolve();
      }
    }, revealTotal());
    return state.revealPromise;
  }

  function hide() {
    if (state.phase === 'idle') {
      return Promise.resolve();
    }
    if (state.phase === 'revealing') {
      return state.revealPromise || Promise.resolve();
    }
    if (state.phase === 'covering') {
      fastFinishCover();
      return (state.coverPromise || Promise.resolve()).then(startReveal);
    }
    return startReveal();
  }

  function forceCleanup() {
    if (state.coverTimer) {
      window.clearTimeout(state.coverTimer);
      state.coverTimer = null;
    }
    if (state.revealTimer) {
      window.clearTimeout(state.revealTimer);
      state.revealTimer = null;
    }
    const staleCover = state.coverResolve;
    state.coverResolve = null;
    if (staleCover) {
      staleCover();
    }
    const staleReveal = state.revealResolve;
    state.revealResolve = null;
    if (staleReveal) {
      staleReveal();
    }
    cleanup();
    state.phase = 'idle';
  }

  function transition(callback, options) {
    if (state.chain) {
      return state.chain;
    }

    const opts = options || {};
    state.chain = Promise.resolve()
      .then(function () {
        return show(opts);
      })
      .then(function () {
        if (typeof callback !== 'function') {
          return undefined;
        }
        try {
          return callback();
        } catch (error) {
          if (typeof console !== 'undefined' && console.error) {
            console.error('[CloudLoader] reset callback failed', error);
          }
          return undefined;
        }
      })
      .then(function () {
        const minHold = Number.isFinite(Number(opts.minHoldMs))
          ? Math.max(0, Number(opts.minHoldMs))
          : config.minHoldMs;
        const remaining = Math.max(0, minHold - (now() - state.coveredAt));
        if (remaining > 0) {
          return new Promise(function (resolve) {
            window.setTimeout(resolve, remaining);
          });
        }
        return undefined;
      })
      .then(function () {
        return hide();
      })
      .then(
        function () {
          state.chain = null;
        },
        function (error) {
          state.chain = null;
          throw error;
        }
      );

    return state.chain;
  }

  function configure(options) {
    if (!options || typeof options !== 'object') {
      return api;
    }

    if (Number.isFinite(Number(options.cloudCount))) {
      config.cloudCount = Math.max(4, Math.round(Number(options.cloudCount)));
    }
    if (options.message === null || typeof options.message === 'string') {
      config.message = options.message;
    }
    if (typeof options.resetMessage === 'string') {
      config.resetMessage = options.resetMessage;
    }
    if (Number.isFinite(Number(options.resetHoldMs))) {
      config.resetHoldMs = Math.max(0, Number(options.resetHoldMs));
    }
    if (Number.isFinite(Number(options.minHoldMs))) {
      config.minHoldMs = Math.max(0, Number(options.minHoldMs));
    }
    if (Number.isFinite(Number(options.loadFailSafeMs))) {
      config.loadFailSafeMs = Math.max(1000, Number(options.loadFailSafeMs));
    }
    if (Number.isFinite(Number(options.zIndex))) {
      config.zIndex = Number(options.zIndex);
    }
    if (options.durations && typeof options.durations === 'object') {
      ['cover', 'reveal', 'drift'].forEach(function (key) {
        if (Number.isFinite(Number(options.durations[key]))) {
          config.durations[key] = Math.max(0, Number(options.durations[key]));
        }
      });
    }
    if (options.colors && typeof options.colors === 'object') {
      Object.keys(DEFAULTS.colors).forEach(function (key) {
        if (typeof options.colors[key] === 'string') {
          config.colors[key] = options.colors[key];
        }
      });
    }

    applyConfig();

    if (state.overlay) {
      if (state.phase === 'idle') {
        buildClouds();
      } else {
        state.pendingRebuild = true;
      }
    }

    return api;
  }

  function hookReset(targets, options) {
    const list = Array.isArray(targets) ? targets : [targets];
    const selector = list
      .map(function (target) {
        if (typeof target === 'string') {
          return target.charAt(0) === '#' ? target : '#' + target;
        }
        return null;
      })
      .filter(Boolean)
      .join(',');

    if (!selector) {
      return api;
    }

    const synthetic = new WeakSet();
    const opts = Object.assign(
      { message: config.resetMessage, minHoldMs: config.resetHoldMs },
      options || {}
    );

    document.addEventListener(
      'click',
      function (event) {
        if (synthetic.has(event)) {
          return;
        }
        const target = event.target;
        const trigger =
          target && typeof target.closest === 'function' ? target.closest(selector) : null;
        if (!trigger) {
          return;
        }

        event.preventDefault();
        event.stopImmediatePropagation();

        transition(function () {
          const replay = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: window
          });
          synthetic.add(replay);
          trigger.dispatchEvent(replay);
        }, opts);
      },
      true
    );

    return api;
  }

  function scheduleBootReveal() {
    const started = now();
    let revealed = false;

    function reveal() {
      if (revealed) {
        return;
      }
      revealed = true;
      state.bootHold = false;
      hide();
    }

    function schedule() {
      const wait = Math.max(0, config.minHoldMs - (now() - started));
      window.setTimeout(reveal, wait);
    }

    if (document.readyState === 'complete') {
      schedule();
    } else {
      window.addEventListener('load', schedule, { once: true });
    }
  }

  function onPageShow(event) {
    if (!event.persisted || state.phase !== 'idle' || state.chain) {
      return;
    }
    show({ message: config.message }).then(function () {
      window.setTimeout(function () {
        hide();
      }, config.minHoldMs);
    });
  }

  function onResize() {
    if (state.resizeTimer) {
      window.clearTimeout(state.resizeTimer);
    }
    state.resizeTimer = window.setTimeout(function () {
      state.resizeTimer = null;
      if (!state.overlay) {
        return;
      }
      if (state.phase === 'idle') {
        buildClouds();
      } else {
        state.pendingRebuild = true;
      }
    }, 220);
  }

  function init() {
    if (state.overlay || !document.body) {
      return;
    }

    buildOverlay();
    applyConfig();
    buildClouds();

    state.phase = 'covered';
    state.coveredAt = now();
    state.bootHold = true;
    state.overlay.classList.add('cl-active', 'cl-covered');
    state.overlay.setAttribute('aria-hidden', 'false');
    setMessage({});
    lockScroll();

    const removeBoot = function () {
      document.documentElement.classList.remove('cl-boot');
    };
    if (typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(removeBoot);
    } else {
      window.setTimeout(removeBoot, 0);
    }

    scheduleBootReveal();
    window.addEventListener('pageshow', onPageShow);
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);

    window.setTimeout(function () {
      if (state.bootHold) {
        forceCleanup();
      }
    }, config.loadFailSafeMs);
  }

  const api = {
    show: show,
    hide: hide,
    transition: transition,
    configure: configure,
    hookReset: hookReset,
    isVisible: function () {
      return state.phase !== 'idle';
    },
    getState: function () {
      return state.phase;
    }
  };

  window.CloudLoader = api;

  if (document.body) {
    init();
  } else {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  }
})();
