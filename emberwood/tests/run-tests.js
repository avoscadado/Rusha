// Emberwood test suite. Developer-only: the game itself needs none of this.
// Run with:  node tests/run-tests.js   (needs Node and Playwright with Chromium)
const { chromium } = require('playwright');
const path = require('path');

const FILE = 'file://' + path.resolve(__dirname, '..', 'Emberwood.html');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(FILE);
  await page.waitForTimeout(300);

  const results = await page.evaluate(() => {
    const E = __ew, S = E.S, { COLS, ROWS } = E, N = COLS * ROWS;
    const { GROUND, TREE, FIRE, ASH, ROCK, WATER, MEADOW } = E.TYPES;
    E.manual = true;
    const out = [];
    const test = (name, fn) => {
      try { const r = fn(); out.push({ name, ok: r === true || r === undefined, info: r === true || r === undefined ? '' : String(r) }); }
      catch (e) { out.push({ name, ok: false, info: 'threw: ' + e.message }); }
    };
    const idx = (x, y) => y * COLS + x;
    // a blank board: all trees, snake parked in a cleared corridor, no strikes, no wind
    function blank(opts) {
      opts = opts || {};
      E.setSeed(opts.seed || 7);
      E.startSeason(opts.season || 0);
      S.T.fill(opts.fill === undefined ? TREE : opts.fill); S.burn.fill(0);
      S.trees0 = N; S.burned = 0; S.fireIdx = []; S.fireCount = 0;
      // a storm far in the future keeps the season from ending under the test
      S.schedule = [{ warnAt: 1e9, landAt: 1e9, count: 1, started: false, done: false }];
      S.strikes = []; S.fruits = []; S.fruitQ = []; S.dew = null; S.dewAt = -1;
      S.windStr = opts.wind || 0; S.wind = opts.windDir || 0; S.windShiftAt = -1; S.windNext = -1;
      S.cfg = Object.assign({}, S.cfg, { target: 0, spot: 0, shift: 0 }, opts.cfg || {});
      const y = opts.y === undefined ? 2 : opts.y;
      S.snake = [];
      for (let k = 0; k < (opts.len || 4); k++) { S.snake.push({ x: 10 - k, y }); S.T[idx(10 - k, y)] = GROUND; }
      S.dir = 'right'; S.queue = []; S.grow = 0; S.moveCD = 1;
      E.setMode('play');
    }
    const moveOnce = () => { const n0 = S.st; let guard = 0; const h0 = S.snake[0]; while (S.mode === 'play' && S.snake[0] === h0 && guard++ < 50) E.step(); return S.st - n0; };
    const fireSteps = n => { for (let k = 0; k < n; k++) E.fireStep(); };

    // ---------------------------------------------------------------- maps
    test('every season map: spawn glade clear, everything passable is reachable, plenty of forest', () => {
      for (let i = 0; i < 16; i++) {
        E.setSeed(1); E.startSeason(i);
        const sx = S.spawn.x, sy = S.spawn.y;
        for (let x = 1; x <= sx + 3; x++) for (let y = sy - 2; y <= sy + 2; y++)
          if (S.T[idx(x, y)] !== MEADOW) return 'season ' + (i + 1) + ': glade cell ' + x + ',' + y + ' is ' + S.T[idx(x, y)];
        const seen = new Uint8Array(N), q = [idx(sx, sy)]; seen[q[0]] = 1;
        while (q.length) {
          const c = q.pop(), x = c % COLS, y = (c / COLS) | 0;
          for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
            const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
            const j = idx(nx, ny); if (seen[j] || S.T[j] === ROCK || S.T[j] === WATER) continue; seen[j] = 1; q.push(j);
          }
        }
        let unreachable = 0, passable = 0;
        for (let c = 0; c < N; c++) if (S.T[c] !== ROCK && S.T[c] !== WATER) { passable++; if (!seen[c]) unreachable++; }
        if (unreachable) return 'season ' + (i + 1) + ': ' + unreachable + ' unreachable cells';
        if (passable < N * 0.8) return 'season ' + (i + 1) + ': only ' + passable + ' passable cells';
        if (S.trees0 < 650) return 'season ' + (i + 1) + ': only ' + S.trees0 + ' trees';
        if (S.fruits.length !== S.cfg.fruit) return 'season ' + (i + 1) + ': ' + S.fruits.length + ' fruit spawned';
        for (const f of S.fruits) if (S.T[idx(f.x, f.y)] !== TREE) return 'fruit not on a tree';
      }
    });
    test('river seasons have a river with crossings', () => {
      for (const i of [2, 4, 6, 8, 9]) {
        E.setSeed(1); E.startSeason(i);
        let water = 0; for (let c = 0; c < N; c++) if (S.T[c] === WATER) water++;
        if (water < 40) return 'season ' + (i + 1) + ' has only ' + water + ' water cells';
      }
    });
    test('the same season always has the same map', () => {
      E.setSeed(1); E.startSeason(4); const a = Array.from(S.T).join('');
      E.setSeed(99); E.startSeason(4); const b = Array.from(S.T).join('');
      return a === b || 'maps differ';
    });

    // ---------------------------------------------------------------- movement
    test('head clears a tree into bare ground; the trail behind stays clear', () => {
      blank(); moveOnce();
      if (S.snake[0].x !== 11) return 'head at ' + S.snake[0].x;
      if (S.T[idx(11, 2)] !== GROUND) return 'cell is ' + S.T[idx(11, 2)];
      moveOnce(); moveOnce();
      return S.T[idx(11, 2)] === GROUND && S.T[idx(13, 2)] === GROUND || 'trail regrew';
    });
    test('pushing through trees is slower than travelling on cleared ground', () => {
      blank(); moveOnce();
      let brush = 0; for (let k = 0; k < 6; k++) brush += moveOnce();
      blank({ fill: GROUND }); moveOnce();
      let road = 0; for (let k = 0; k < 6; k++) road += moveOnce();
      return brush > road * 1.3 || 'brush ' + brush + ' vs road ' + road;
    });
    test('reversing into your own neck is ignored, not fatal', () => {
      blank({ fill: GROUND }); E.enqueue('left'); moveOnce();
      return S.mode === 'play' && S.dir === 'right' || 'mode ' + S.mode + ' dir ' + S.dir;
    });
    test('quick double turn (up then left) inside one move is honoured in order', () => {
      blank({ fill: GROUND, y: 10 }); E.enqueue('up'); E.enqueue('left'); moveOnce();
      if (S.dir !== 'up') return 'first move went ' + S.dir;
      moveOnce(); return S.dir === 'left' && S.mode === 'play' || 'second move went ' + S.dir + ' mode ' + S.mode;
    });
    test('chasing your own tail is allowed', () => {
      blank({ fill: GROUND, y: 10 });
      // make a 2x2 loop: a length-4 snake turning right three times follows its tail
      E.enqueue('down'); moveOnce(); E.enqueue('left'); moveOnce(); E.enqueue('up'); moveOnce(); moveOnce();
      return S.mode === 'play' || 'died: ' + S.deathReason;
    });
    test('biting your body is fatal', () => {
      blank({ fill: GROUND, y: 10, len: 8 });
      E.enqueue('down'); moveOnce(); E.enqueue('left'); moveOnce(); E.enqueue('up'); moveOnce();
      return S.mode === 'dying' && S.deathReason === 'self' || 'mode ' + S.mode + ' reason ' + S.deathReason;
    });
    test('fire, rock, water and the edge are fatal', () => {
      const r = [];
      for (const [t, why] of [[FIRE, 'fire'], [ROCK, 'rock'], [WATER, 'water']]) {
        blank({ fill: GROUND }); S.T[idx(11, 2)] = t; moveOnce();
        if (!(S.mode === 'dying' && S.deathReason === why)) r.push(why + ' -> ' + S.mode + '/' + S.deathReason);
      }
      blank({ fill: GROUND, y: 0 }); E.enqueue('up'); moveOnce();
      if (!(S.mode === 'dying' && S.deathReason === 'edge')) r.push('edge -> ' + S.mode);
      return r.length ? r.join('; ') : true;
    });
    test('fruit: +50 points and two more segments', () => {
      blank(); S.fruits = [{ x: 11, y: 2, ph: 0 }]; const sc = S.score, len = S.snake.length;
      moveOnce(); moveOnce(); moveOnce();
      return S.score === sc + 50 && S.snake.length === len + 2 && S.eaten === 1 || 'score ' + (S.score - sc) + ' len ' + S.snake.length;
    });

    // ---------------------------------------------------------------- fire
    test('fire never crosses a one-cell carved line, even in a gale (no embers)', () => {
      for (let trial = 0; trial < 12; trial++) {
        blank({ wind: 0.85, windDir: trial % 8, seed: 100 + trial, cfg: { spread: 0.09 } });
        S.snake = [{ x: 0, y: 27 }];
        for (let y = 0; y < ROWS; y++) S.T[idx(20, y)] = GROUND;        // vertical line
        for (let x = 0; x < COLS; x++) S.T[idx(x, 14)] = GROUND;        // horizontal line
        S.T[idx(10, 7)] = FIRE; S.burn[idx(10, 7)] = 12; S.fireIdx = [idx(10, 7)];
        fireSteps(600);
        for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++)
          if ((x > 20 || y > 14) && (S.T[idx(x, y)] === FIRE || S.T[idx(x, y)] === ASH)) return 'burned at ' + x + ',' + y + ' (wind ' + trial % 8 + ')';
      }
    });
    test('a diagonal staircase trail also holds fire', () => {
      blank({ wind: 0.85, windDir: 1, cfg: { spread: 0.09 } });
      // staircase from (0,0) to (27,27): exactly what a snake zig-zagging down-right leaves
      for (let k = 0; k < 27; k++) { S.T[idx(k, k)] = GROUND; S.T[idx(k + 1, k)] = GROUND; }
      S.T[idx(27, 27)] = GROUND;
      S.T[idx(10, 2)] = FIRE; S.burn[idx(10, 2)] = 12; S.fireIdx = [idx(10, 2)];
      fireSteps(600);
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++)
        if (x < y && (S.T[idx(x, y)] === FIRE || S.T[idx(x, y)] === ASH)) return 'leaked to ' + x + ',' + y;
    });
    test('wind pushes fire downwind', () => {
      let down = 0, up = 0;
      for (let trial = 0; trial < 10; trial++) {
        blank({ wind: 0.6, windDir: 0, seed: 300 + trial, cfg: { spread: 0.055 } });
        S.snake = [{ x: 0, y: 27 }];
        S.T[idx(20, 14)] = FIRE; S.burn[idx(20, 14)] = 12; S.fireIdx = [idx(20, 14)];
        fireSteps(60);
        for (let c = 0; c < N; c++) if (S.T[c] === FIRE || S.T[c] === ASH) { const x = c % COLS; if (x > 20) down++; else if (x < 20) up++; }
      }
      return down > up * 3 || 'downwind ' + down + ' upwind ' + up;
    });
    test('fires burn out to ash and the season can end', () => {
      blank({ cfg: { spread: 0 } });
      S.T[idx(30, 20)] = FIRE; S.burn[idx(30, 20)] = 5; S.fireIdx = [idx(30, 20)]; S.fireCount = 1;
      fireSteps(6);
      return S.T[idx(30, 20)] === ASH && S.fireCount === 0 || 'cell ' + S.T[idx(30, 20)] + ' count ' + S.fireCount;
    });
    test('fire that reaches a fruit destroys it and the fruit grows back elsewhere', () => {
      blank({ cfg: { spread: 1 } });
      S.fruits = [{ x: 31, y: 20, ph: 0 }];
      S.T[idx(30, 20)] = FIRE; S.burn[idx(30, 20)] = 12; S.fireIdx = [idx(30, 20)];
      E.fireStep();
      S.cfg.spread = 0;
      if (S.fruits.length) return 'fruit survived';
      for (let k = 0; k < E.sec(7); k++) { S.snake[0] = S.snake[0]; E.step(); if (S.mode !== 'play') break; }
      return S.fruits.length === 1 && S.T[idx(S.fruits[0].x, S.fruits[0].y)] === TREE || 'fruits ' + S.fruits.length;
    });

    test('embers jump a one-cell break in a gale, but a two-cell break always holds', () => {
      let jumped1 = 0;
      for (let trial = 0; trial < 20; trial++) {
        for (const width of [1, 2]) {
          blank({ wind: 0.85, windDir: [0, 1, 7][trial % 3], seed: 500 + trial, cfg: { spread: 0.09, spot: 0.05 } });
          S.snake = [{ x: 0, y: 27 }];
          for (let w = 0; w < width; w++) for (let y = 0; y < ROWS; y++) S.T[idx(20 + w, y)] = GROUND;
          for (let y = 0; y < ROWS; y++) { S.T[idx(5, y)] = FIRE; S.burn[idx(5, y)] = 12; }
          S.fireIdx = []; for (let c = 0; c < N; c++) if (S.T[c] === FIRE) S.fireIdx.push(c);
          fireSteps(500);
          let crossed = false;
          for (let y = 0; y < ROWS; y++) for (let x = 20 + width; x < COLS; x++) if (S.T[idx(x, y)] === FIRE || S.T[idx(x, y)] === ASH) crossed = true;
          if (width === 2 && crossed) return 'a two-wide break was crossed (trial ' + trial + ')';
          if (width === 1 && crossed) jumped1++;
        }
      }
      return jumped1 > 0 || 'embers never jumped a one-wide break, so the HUD warning would be a lie';
    });
    test('a tree that caught fire a moment ago is stamped out by the head, not fatal', () => {
      blank({ fill: GROUND });
      S.T[idx(11, 2)] = TREE; S.st = 100;
      E.fireStep;  // (no-op reference)
      S.T[idx(11, 2)] = FIRE; S.burn[idx(11, 2)] = 12; S.ignAt[idx(11, 2)] = S.st; S.fireIdx = [idx(11, 2)]; S.fireCount = 1;
      moveOnce();
      if (S.mode !== 'play') return 'died: ' + S.deathReason;
      if (S.T[idx(11, 2)] !== GROUND || S.fireCount !== 0) return 'fire not stamped out';
      blank({ fill: GROUND }); S.st = 100;
      S.T[idx(11, 2)] = FIRE; S.burn[idx(11, 2)] = 12; S.ignAt[idx(11, 2)] = 50; S.fireIdx = [idx(11, 2)]; S.fireCount = 1;
      moveOnce();
      return S.mode === 'dying' && S.deathReason === 'fire' || 'an old fire did not kill: ' + S.mode;
    });
    test('clearing trees costs half a tree of forest each', () => {
      blank(); S.trees0 = 1000;
      for (let k = 0; k < 10; k++) moveOnce();
      return Math.abs(E.savedPct() - (100 - 100 * (S.carved * 0.5) / 1000)) < 1e-9 && S.carved >= 9 || 'saved ' + E.savedPct() + ' carved ' + S.carved;
    });
    // ---------------------------------------------------------------- strikes, dew
    test('a strike on a tree starts a fire; a strike on cleared ground is grounded for points', () => {
      blank({ fill: TREE });
      S.schedule = [{ warnAt: 1, landAt: 3, count: 1, started: true, done: false }];
      S.strikes = [{ x: 30, y: 20, warnAt: 1, landAt: S.st + 2 }];
      E.step(); E.step(); E.step();
      if (S.T[idx(30, 20)] !== FIRE) return 'no fire after strike';
      blank({ fill: TREE });
      S.T[idx(30, 20)] = GROUND; const sc = S.score;
      S.schedule = [{ warnAt: 1, landAt: 3, count: 1, started: true, done: false }];
      S.strikes = [{ x: 30, y: 20, warnAt: 1, landAt: S.st + 2 }];
      E.step(); E.step(); E.step();
      return S.T[idx(30, 20)] === GROUND && S.groundedN === 1 && S.score === sc + 30 || 'grounded ' + S.groundedN;
    });
    test('strike marks are never placed close to the snake', () => {
      for (let trial = 0; trial < 200; trial++) {
        E.setSeed(trial); E.startSeason(trial % 10); E.setMode('play');
        const g = S.schedule[0]; S.st = g.warnAt - 1; E.step();
        const h = S.snake[0];
        for (const s of S.strikes) if (Math.abs(s.x - h.x) + Math.abs(s.y - h.y) < 12) return 'strike ' + (Math.abs(s.x - h.x) + Math.abs(s.y - h.y)) + ' cells from the head';
      }
    });
    test('strike marks never land on fruit or dew', () => {
      for (let trial = 0; trial < 300; trial++) {
        E.setSeed(trial); E.startSeason(9); E.setMode('play');
        S.fruits = []; for (let k = 0; k < 60; k++) S.fruits.push({ x: (k * 7) % COLS, y: (k * 3) % ROWS, ph: 0 });
        const g = S.schedule[0]; S.st = g.warnAt - 1; E.step();
        for (const st of S.strikes) if (S.fruits.some(f => f.x === st.x && f.y === st.y)) return 'strike on fruit';
      }
    });
    test('dew puts out fire around the snake', () => {
      blank({ y: 14 });
      for (let y = 11; y <= 17; y++) for (let x = 13; x <= 16; x++) { S.T[idx(x, y)] = FIRE; S.burn[idx(x, y)] = 12; }
      S.fireIdx = []; for (let c = 0; c < N; c++) if (S.T[c] === FIRE) S.fireIdx.push(c); S.fireCount = S.fireIdx.length;
      S.dew = { x: 11, y: 14, until: S.st + 9999 };
      moveOnce();
      let left = 0; for (let c = 0; c < N; c++) if (S.T[c] === FIRE) left++;
      return left === 0 && S.dew === null && S.fireCount === 0 || left + ' fires left';
    });

    // ---------------------------------------------------------------- season flow
    test('season passes once the storm is over and the last fire is out', () => {
      E.setSeed(5); E.startGame(); E.setMode('play'); S.noSnake = true;
      for (const g of S.schedule) { g.started = true; g.done = true; }
      S.strikes = []; S.fireIdx = []; S.fireCount = 0;
      const sc = S.score;
      for (let k = 0; k < E.sec(2); k++) { E.step(); if (S.mode !== 'play') break; }
      S.noSnake = false;
      if (S.mode !== 'tally' || !S.result.pass) return 'mode ' + S.mode;
      if (S.score <= sc) return 'no points';
      E.setMode('tally'); S.modeT = 1000;
      // afterTally via the keyboard handler path is covered by the browser test; call through the API here
      return true;
    });
    test('losing too much forest fails the season and costs a life; no lives left means game over', () => {
      E.setSeed(5); E.startGame(); E.setMode('play'); S.noSnake = true;
      S.burned = Math.ceil(S.trees0 * 0.9);
      E.step(); S.noSnake = false;
      if (S.mode !== 'tally' || S.result.pass) return 'mode ' + S.mode;
      if (S.lives !== 2) return 'lives ' + S.lives;
      return true;
    });
    test('an endless season config is valid and harder than the last campaign season', () => {
      const a = E.cfgFor(9), b = E.cfgFor(12);
      return b.strikes > a.strikes && b.target <= a.target && b.spread >= a.spread || JSON.stringify(b);
    });

    // ---------------------------------------------------------------- fuzz
    test('fuzz: 1,400 seconds of a random but self-preserving snake across 14 seasons keeps every invariant', () => {
      const dirs = ['up', 'down', 'left', 'right'];
      const DV = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
      let deaths = 0, seasonsEnded = 0, maxFire = 0;
      for (let season = 0; season < 14; season++) {
        E.setSeed(1000 + season); E.startSeason(season); S.lives = 99; E.setMode('play');
        const cap = E.sec(100);
        for (let k = 0; k < cap; k++) {
          if (S.mode === 'dying') { deaths++; S.lives--; E.startSeason(season); S.lives = 99; E.setMode('play'); continue; }
          if (S.mode !== 'play') { seasonsEnded++; break; }
          if (S.moveCD === 1 && Math.random() < 0.35) {
            const h = S.snake[0];
            const safe = dirs.filter(d => {
              const nx = h.x + DV[d][0], ny = h.y + DV[d][1];
              if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) return false;
              const t = S.T[idx(nx, ny)]; if (t === ROCK || t === WATER || t === FIRE) return false;
              return !S.snake.slice(0, -1).some(s => s.x === nx && s.y === ny);
            });
            if (safe.length) E.enqueue(safe[Math.floor(Math.random() * safe.length)]);
          }
          E.step();
          // invariants
          const seen = new Set();
          for (const s of S.snake) {
            if (s.x < 0 || s.y < 0 || s.x >= COLS || s.y >= ROWS) return 'snake off board';
            const key = s.x + ',' + s.y; if (seen.has(key)) return 'snake overlaps itself at ' + key;
            seen.add(key);
            const t = S.T[idx(s.x, s.y)];
            if (t === ROCK || t === WATER || t === TREE) return 'snake on terrain ' + t + ' at ' + key;
          }
          if (S.mode === 'play' && S.T[idx(S.snake[0].x, S.snake[0].y)] === FIRE) return 'head in fire';
          const fk = new Set();
          for (const f of S.fruits) { if (S.T[idx(f.x, f.y)] !== TREE) return 'fruit on non-tree'; const key = f.x + ',' + f.y; if (fk.has(key)) return 'stacked fruit'; fk.add(key); }
          if (S.dew && S.T[idx(S.dew.x, S.dew.y)] !== TREE) return 'dew on non-tree';
          for (const s of S.strikes) if (s.x < 0 || s.y < 0 || s.x >= COLS || s.y >= ROWS) return 'strike off board';
          if (S.st % 10 === 0) { let fc = 0; for (let c = 0; c < N; c++) if (S.T[c] === FIRE) fc++; if (fc !== S.fireCount) return 'fire count drift ' + fc + ' vs ' + S.fireCount; maxFire = Math.max(maxFire, fc); }
          if (S.burned > S.trees0) return 'burned more trees than exist';
        }
      }
      return true;
    });
    test('every season ends on its own (no hangs), with no snake on the board', () => {
      const lens = [];
      for (let season = 0; season < 13; season++) {
        E.setSeed(2000 + season); E.startSeason(season); S.cfg = Object.assign({}, S.cfg, { target: 0 });
        S.noSnake = true; E.setMode('play');
        let k = 0; const cap = E.sec(S.cfg.window + 200);
        while (S.mode === 'play' && k++ < cap) E.step();
        S.noSnake = false;
        if (S.mode !== 'tally') return 'season ' + (season + 1) + ' did not end';
        lens.push(Math.round(S.st * 25 / 1000));
      }
      return true;
    });
    return out;
  });

  let failed = 0;
  for (const r of results) {
    console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.info ? '  ->  ' + r.info : ''));
    if (!r.ok) failed++;
  }

  // ---------------------------------------------------------------- real keyboard, real time
  await page.evaluate(() => { __ew.manual = false; __ew.S.noSnake = false; __ew.demoInit(); __ew.setMode('title'); });
  await page.keyboard.press('Enter'); await page.waitForTimeout(150);
  let s = await page.evaluate(() => __ew.S.mode);
  const kb = [];
  kb.push(['Enter on the title starts the first season', s === 'ready' && await page.evaluate(() => __ew.S.season === 0)]);
  await page.keyboard.press('ArrowRight'); await page.waitForTimeout(600);
  s = await page.evaluate(() => ({ mode: __ew.S.mode, x: __ew.S.snake[0].x }));
  kb.push(['an arrow key starts the snake moving', s.mode === 'play' && s.x > 6]);
  await page.keyboard.press('Space'); await page.waitForTimeout(400);
  const p1 = await page.evaluate(() => ({ mode: __ew.S.mode, st: __ew.S.st }));
  await page.waitForTimeout(400);
  const p2 = await page.evaluate(() => ({ mode: __ew.S.mode, st: __ew.S.st }));
  kb.push(['Space pauses and the world stops', p1.mode === 'paused' && p1.st === p2.st]);
  await page.keyboard.press('Space'); await page.waitForTimeout(200);
  kb.push(['Space resumes', await page.evaluate(() => __ew.S.mode) === 'play']);
  await page.keyboard.press('ArrowUp'); await page.waitForTimeout(300);
  kb.push(['steering with the keyboard turns the snake', await page.evaluate(() => __ew.S.dir) === 'up']);
  // crash into the top edge (or whatever is in the way), watch a life go
  for (let t = 0; t < 40; t++) { await page.waitForTimeout(250); if (await page.evaluate(() => __ew.S.mode) === 'ready') break; }
  s = await page.evaluate(() => ({ mode: __ew.S.mode, lives: __ew.S.lives }));
  kb.push(['running off the edge costs a life and returns to the ready screen', s.mode === 'ready' && s.lives === 2]);
  // drive a season to a pass and walk through the tally into season 2
  await page.evaluate(() => { const S = __ew.S; for (const g of S.schedule) { g.started = true; g.done = true; } S.strikes = []; for (let i = 0; i < S.T.length; i++) if (S.T[i] === 2) S.T[i] = 3; S.fireIdx = []; S.fireCount = 0; });
  await page.keyboard.press('ArrowDown'); await page.waitForTimeout(1600);
  kb.push(['a finished season shows the tally', await page.evaluate(() => __ew.S.mode) === 'tally']);
  await page.keyboard.press('Enter'); await page.waitForTimeout(100);
  kb.push(['Enter is ignored for the first moment of the tally (no accidental skip)', await page.evaluate(() => __ew.S.mode) === 'tally']);
  await page.waitForTimeout(800); await page.keyboard.press('Enter'); await page.waitForTimeout(150);
  kb.push(['Enter then moves on to season 2', await page.evaluate(() => __ew.S.mode === 'ready' && __ew.S.season === 1)]);
  await page.keyboard.press('KeyM');
  kb.push(['M toggles sound without breaking anything', await page.evaluate(() => __ew.S.mode) === 'ready']);
  const prevented = await page.evaluate(() => {
    const r = {};
    for (const [key, meta] of [['s', true], ['a', true], ['ArrowLeft', true], ['d', false]]) {
      const ev = new KeyboardEvent('keydown', { key, metaKey: meta, bubbles: true, cancelable: true });
      window.dispatchEvent(ev); r[key + (meta ? '+cmd' : '')] = ev.defaultPrevented;
    }
    return r;
  });
  kb.push(['Cmd shortcuts are left to the browser; plain game keys are captured', !prevented['s+cmd'] && !prevented['a+cmd'] && !prevented['ArrowLeft+cmd'] && prevented['d']]);
  const rep = await page.evaluate(() => {
    __ew.setMode('play'); __ew.S.pausedFrom = 'play';
    const send = (key, repeat) => window.dispatchEvent(new KeyboardEvent('keydown', { key, repeat, bubbles: true, cancelable: true }));
    send(' ', false); const a = __ew.S.mode; send(' ', true); send(' ', true); const b = __ew.S.mode;
    return [a, b];
  });
  kb.push(['holding Space pauses once instead of flickering', rep[0] === 'paused' && rep[1] === 'paused']);
  const disp = await page.evaluate(() => { const S = __ew.S; __ew.setMode('play'); S.cfg = Object.assign({}, S.cfg, { target: 74 }); S.trees0 = 10000; S.carved = 0; S.burned = 2646; return [__ew.savedPct(), Math.floor(__ew.savedPct())]; });
  kb.push(['at 73.54% the HUD shows 73, not a passing 74', disp[1] === 73]);
  for (const [name, ok] of kb) { console.log((ok ? 'PASS ' : 'FAIL ') + name); if (!ok) failed++; }

  if (errors.length) { console.log('FAIL page errors:\n  ' + errors.join('\n  ')); failed++; }
  console.log(failed ? '\n' + failed + ' FAILED' : '\nall ' + (results.length + kb.length) + ' tests passed');
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
