// Core logic tests. Run: node ouroboros/tests/core.test.mjs
import assert from 'node:assert/strict';
import { loadCore } from './load-core.mjs';

const O = loadCore();
const { Game, DIRS, CFG } = O;
let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { console.log('  FAIL ' + name + '\n       ' + (e && e.stack || e)); process.exitCode = 1; }
}

// A deliberately simple autopilot: survive, and head for the nearest free fruit.
function pickMove(g) {
  const C = g.cfg.cols, R = g.cfg.rows, run = g.run, t = run.t, hi = run.hi(t), si = run.si(t);
  const hx = run.px[hi], hy = run.py[hi], cur = g.queue.length ? g.queue[g.queue.length - 1] : run.dir;
  const occ = g.echoOcc(t + 1, new Uint8Array(C * R));
  const body = new Set(); for (let i = si + 1; i <= hi; i++) body.add(run.px[i] + run.py[i] * C);
  const targets = [];
  for (const f of g.fruits) if (g.owner[f.id] < 0 && !g.eaten[f.id] && f.t1 > t + 2 && f.t0 <= t + 8) targets.push(f);
  let bestD = null, bestS = -1e9;
  for (const d of [cur, (cur + 1) & 3, (cur + 3) & 3]) {
    const nx = hx + DIRS[d].x, ny = hy + DIRS[d].y;
    if (nx < 0 || ny < 0 || nx >= C || ny >= R) continue;
    if (body.has(nx + ny * C) || occ[nx + ny * C]) continue;
    let s = 0;
    // free space ahead
    let room = 0; for (let k = 1; k <= 6; k++) { const x = nx + DIRS[d].x * k, y = ny + DIRS[d].y * k; if (x < 0 || y < 0 || x >= C || y >= R || body.has(x + y * C)) break; room++; }
    s += room * 0.5;
    if (targets.length) { let md = 1e9; for (const f of targets) md = Math.min(md, Math.abs(f.x - nx) + Math.abs(f.y - ny)); s -= md; }
    if (d === cur) s += 0.2;
    if (s > bestS) { bestS = s; bestD = d; }
  }
  return bestD;
}
function playDay(g, maxTicks) {
  g.begin();
  let n = 0;
  while (g.status === 'play' && n++ < (maxTicks || 5000)) {
    const d = pickMove(g);
    if (d !== null && d !== undefined) g.input(d);
    g.step();
  }
}

test('plan is deterministic and well formed', () => {
  const a = O.makePlan(1234, CFG), b = O.makePlan(1234, CFG), c = O.makePlan(1235, CFG);
  assert.deepEqual(a.fruits, b.fruits);
  assert.notDeepEqual(a.fruits, c.fruits);
  for (const f of a.fruits) {
    assert.ok(f.x >= 1 && f.x <= CFG.cols - 2 && f.y >= 1 && f.y <= CFG.rows - 2, 'in bounds');
    assert.ok(f.t0 >= 0 && f.t1 > f.t0);
  }
  for (let i = 0; i < a.fruits.length; i++) for (let j = i + 1; j < a.fruits.length; j++) {
    const p = a.fruits[i], q = a.fruits[j];
    if (p.t0 < q.t1 && q.t0 < p.t1) assert.ok(Math.max(Math.abs(p.x - q.x), Math.abs(p.y - q.y)) > CFG.minGap, 'overlapping fruit too close');
  }
  console.log('       fruit per day:', a.fruits.length);
});

test('classic rules: walls kill, reversing is ignored, buffer holds two turns', () => {
  const g = new Game(7); g.begin();
  assert.equal(g.run.dir, 1);
  assert.equal(g.input(3), false, 'reverse ignored');
  assert.equal(g.input(1), false, 'same direction ignored');
  assert.equal(g.input(0), true); assert.equal(g.input(3), true); assert.equal(g.input(2), false, 'third is dropped');
  let ev = g.step(); assert.equal(g.run.dir, 0);
  // run into the top wall
  let guard = 0; while (g.status === 'play' && guard++ < 100) { ev = g.step(); }
  assert.equal(g.status, 'dead'); assert.equal(g.death.reason, 'wall');
});

test('self collision kills, but following your own tail does not', () => {
  const g = new Game(9, { startLen: 4 }); g.begin();
  // circle: up, left, down gives a 2x2 loop that re-enters the vacated tail cell
  g.input(0); g.step(); g.input(3); g.step(); g.input(2); g.step();
  assert.equal(g.status, 'play', 'tight loop of length 4 is legal because the tail vacates');
  g.input(1); const ev = g.step();
  assert.equal(g.status, 'play');
  assert.equal(ev.dead, null);
  const g2 = new Game(9, { startLen: 5 }); g2.begin();
  g2.input(0); g2.step(); g2.input(3); g2.step(); g2.input(2); g2.step(); g2.input(1); g2.step();
  assert.equal(g2.status, 'dead'); assert.equal(g2.death.reason, 'self');
});

test('a full day on autopilot: invariants hold every tick', () => {
  const g = new Game(42); g.begin();
  const C = g.cfg.cols;
  let guard = 0;
  while (g.status === 'play' && guard++ < 5000) {
    const d = pickMove(g); if (d !== null) g.input(d);
    g.step();
    if (g.status !== 'play') break;
    const run = g.run, t = run.t, hi = run.hi(t), si = run.si(t);
    assert.equal(hi - si + 1, run.lens[t], 'body length consistent');
    assert.equal(run.lens[t], g.cfg.startLen + run.count, 'length equals start plus fruit eaten');
    const seen = new Set();
    for (let i = si; i <= hi; i++) { const k = run.px[i] + run.py[i] * C; assert.ok(!seen.has(k), 'no self overlap'); seen.add(k); }
  }
  assert.ok(['dayDone', 'dead', 'final'].includes(g.status), 'ended: ' + g.status);
  console.log('       status', g.status, 'ticks', g.run.t, 'eaten', g.run.count);
});

test('echo replays the recorded day exactly and takes the same fruit at the same ticks', () => {
  const g = new Game(5);
  playDay(g);
  if (g.status === 'dead') { while (g.status === 'dead') { g.afterDeath(); playDay(g); } }
  assert.ok(g.status === 'dayDone' || g.status === 'final', 'day 1 finished: ' + g.status);
  const rec = g.echoes[0];
  const recorded = { px: rec.px.slice(), py: rec.py.slice(), ate: rec.ateId.slice(), lens: rec.lens.slice() };
  const eatenByEcho = rec.ateId.filter(x => x >= 0);
  assert.ok(eatenByEcho.length > 0, 'ate something');
  if (g.status === 'dayDone') {
    g.nextDay();
    assert.equal(g.echoes.length, 1);
    for (const id of eatenByEcho) assert.equal(g.owner[id], 0, 'fruit owned by echo');
    // the echo is a pure function of the tick
    for (let t = 0; t <= rec.t; t++) {
      assert.equal(rec.px[rec.hi(t)], recorded.px[rec.hi(t)]);
      assert.equal(rec.lens[t], recorded.lens[t]);
    }
    // player cannot eat owned fruit even by standing on it
    const id = eatenByEcho[0], f = g.fruits[id];
    assert.ok(g.cellFruit[f.x + f.y * g.cfg.cols].includes(id));
    // events from the echo's meals arrive at the recorded ticks
    g.begin();
    const seenEat = [];
    let guard = 0;
    while (g.status === 'play' && guard++ < 5000) {
      const d = pickMove(g); if (d !== null) g.input(d);
      const ev = g.step(); if (!ev || ev.dead) break;
      for (const e of ev.echoAte) { seenEat.push([g.run.t, e.id]); assert.equal(rec.ateId[g.run.t], e.id); }
      if (ev.ate >= 0) assert.ok(!eatenByEcho.includes(ev.ate), 'player never eats an echo fruit');
      if (ev.done) break;
    }
    if (g.status !== 'dead') assert.equal(seenEat.length, eatenByEcho.length, 'echo ate everything it ate before');
  }
});

function setup(echoRun, playerRun) {
  const g = new Game(11);
  echoRun.color = 0; g.echoes.push(echoRun); g.beginDay();
  g.run = playerRun; g.begin();
  return g;
}
test('touching an echo kills: head-on in the same cell', () => {
  const echo = new O.Run(12, 14, 3, 3); for (let i = 0; i < 30; i++) echo.push(11 - i, 14, -1);
  const g = setup(echo, new O.Run(10, 14, 1, 3));
  const ev = g.step();                       // player 11, echo 11
  assert.ok(ev.dead && ev.dead.reason === 'echo' && ev.dead.echo === 0);
});
test('touching an echo kills: head-on swap (heads pass through each other)', () => {
  const echo = new O.Run(11, 14, 3, 3); for (let i = 0; i < 30; i++) echo.push(10 - i, 14, -1);
  const g = setup(echo, new O.Run(10, 14, 1, 3));
  const ev = g.step();                       // player 10->11 while echo 11->10
  assert.ok(ev.dead && ev.dead.reason === 'echo', 'swap must be a collision');
});
test('an echo biting your body kills you', () => {
  const echo = new O.Run(20, 10, 2, 3); for (let i = 0; i < 30; i++) echo.push(20, 11 + i, -1);   // heading down column 20
  const g = setup(echo, new O.Run(22, 13, 3, 6));    // player heading left along row 13, body trailing to the right
  g.step(); g.step(); assert.equal(g.status, 'play', 'adjacent but not touching at tick 2');
  const ev = g.step();                                // tick 3: echo head enters (20,13), where the player's neck is
  assert.ok(ev.dead && ev.dead.reason === 'echo');
});
test('entering the cell an echo tail is vacating is safe', () => {
  const echo = new O.Run(20, 14, 1, 3); for (let i = 0; i < 30; i++) echo.push(21 + i, 14, -1);   // tail at 18 leaves as the player steps in
  const g = setup(echo, new O.Run(17, 14, 1, 3));
  for (let i = 0; i < 12; i++) { const ev = g.step(); assert.equal(ev.dead, null, 'following an echo\'s tail is legal (tick ' + (i + 1) + ')'); }
});

test('spawn is clear of echoes and day restarts identically after a rewind', () => {
  const g = new Game(21);
  playDay(g); let guard = 0;
  while (g.status === 'dead' && guard++ < 10) { g.afterDeath(); playDay(g); }
  if (g.status !== 'dayDone') return;
  g.nextDay();
  const s1 = { x: g.run.px[g.run.hi(0)], y: g.run.py[g.run.hi(0)], d: g.run.dir };
  g.begin(); g.input((g.run.dir + 1) & 3); for (let i = 0; i < 3; i++) g.step();
  const before = g.rewinds; g.status = 'dead'; g.afterDeath();
  assert.equal(g.rewinds, before - 1); assert.equal(g.attempt, 2);
  assert.deepEqual({ x: g.run.px[g.run.hi(0)], y: g.run.py[g.run.hi(0)], d: g.run.dir }, s1, 'same spawn on retry');
  assert.equal(g.run.t, 0); assert.equal(g.eaten.reduce((a, b) => a + b, 0), 0, 'failed attempt left nothing behind');
});

test('fuzz: random play never throws and never leaves two snakes overlapping while alive', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const g = new Game(seed * 7919);
    let r = O.mulberry32(seed);
    let days = 0, guard = 0;
    while (g.status !== 'final' && guard++ < 40) {
      g.begin();
      let n = 0;
      while (g.status === 'play' && n++ < 700) {
        if (r() < 0.25) g.input(Math.floor(r() * 4)); else if (r() < 0.7) { const d = pickMove(g); if (d !== null) g.input(d); }
        const ev = g.step();
        if (g.status === 'play') {
          const t = g.run.t, occ = g.echoOcc(t, new Uint8Array(g.cfg.cols * g.cfg.rows)), run = g.run;
          for (let i = run.si(t); i <= run.hi(t); i++) assert.equal(occ[run.px[i] + run.py[i] * g.cfg.cols], 0, 'overlap while alive');
        }
      }
      if (g.status === 'dead') g.afterDeath();
      else if (g.status === 'dayDone') { g.nextDay(); days++; }
    }
    const seenOwners = new Set();
    g.echoes.forEach((e, k) => e.ateId.forEach(id => { if (id >= 0) { assert.ok(!seenOwners.has(id), 'fruit owned twice'); seenOwners.add(id); } }));
  }
});

test('score and harvest accounting', () => {
  const g = new Game(3); playDay(g); let guard = 0;
  while (g.status === 'dead' && guard++ < 10) { g.afterDeath(); playDay(g); }
  if (g.status === 'dayDone' || g.status === 'final') {
    assert.equal(g.harvested(), g.echoes.reduce((a, e) => a + e.count, 0));
    assert.ok(g.score > 0);
    assert.equal(g.dayScore, 0, 'a finished day is banked once, so the HUD (score + dayScore) cannot count it twice');
  }
});

test('running out of rewinds discards the day you died in', () => {
  const g = new Game(5, { rewinds: 0 }); g.begin();
  for (let i = 0; i < 400 && g.status === 'play'; i++) { const d = pickMove(g); if (d !== null) g.input(d); g.step(); if (g.run.count >= 2) break; }
  const ate = g.run.count; g.input((g.run.dir + 1) & 3);
  g.status = 'dead'; g.death = { reason: 'wall', x: 0, y: 0, echo: -1, t: g.run.t };
  assert.equal(g.afterDeath(), false);
  assert.equal(g.status, 'final'); assert.equal(g.final.harvested, 0, 'fruit from the lost day (' + ate + ') is not banked'); assert.equal(g.dayScore, 0);
});

console.log(passed + ' passed' + (process.exitCode ? ', with failures' : ''));
