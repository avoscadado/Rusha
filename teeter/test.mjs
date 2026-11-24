// Automated checks for teeter.html. Run with: node teeter/test.mjs
// Loads the real file in headless Chromium, then exercises the rules, a bot, and the keyboard UI.
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const { chromium } = createRequire(import.meta.url)("playwright");
const here = path.dirname(fileURLToPath(import.meta.url));
const url = pathToFileURL(path.join(here, "teeter.html")).href;
const shotDir = process.env.SHOTS || null;
let failed = 0;
const check = (name, ok, extra = "") => { console.log((ok ? "PASS " : "FAIL ") + name + (extra ? "  " + extra : "")); if (!ok) failed++; };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await page.goto(url);

// ---------- 1. Rule invariants under a bot and under random play ----------
const sim = await page.evaluate(() => {
  const { createCore, CONFIG, DIRS, OPP } = window.TEETER;
  const { W, H } = CONFIG;
  const names = Object.keys(DIRS);

  function invariants(core) {
    const S = core.S, seen = new Set();
    for (let i = 0; i < S.snake.length; i++) {
      const s = S.snake[i], k = s.y * W + s.x;
      if (s.x < 0 || s.y < 0 || s.x >= W || s.y >= H) return "snake out of bounds";
      if (seen.has(k)) return "snake overlaps itself";
      seen.add(k);
      if (!S.occ[k]) return "occ missing snake cell";
      if (i && Math.abs(s.x - S.snake[i - 1].x) + Math.abs(s.y - S.snake[i - 1].y) !== 1) return "snake not contiguous";
    }
    let occCount = 0; for (let i = 0; i < W * H; i++) occCount += S.occ[i];
    if (occCount !== S.snake.length) return "occ count mismatch " + occCount + " vs " + S.snake.length;
    let objCount = 0; for (let i = 0; i < W * H; i++) if (S.objAt[i]) objCount++;
    if (objCount !== S.objs.length) return "objAt count mismatch";
    for (const o of S.objs) {
      const k = o.y * W + o.x;
      if (o.x < 0 || o.y < 0 || o.x >= W || o.y >= H) return "object out of bounds";
      if (S.objAt[k] !== o) return "objAt mismatch";
      if (seen.has(k)) return "object inside snake";
      if (Math.abs(o.ax) > 0.5001 || Math.abs(o.ay) > 0.5001) return "sub-cell offset too large";
      if (![o.vx, o.vy, o.ax, o.ay].every(Number.isFinite)) return "non-finite physics";
    }
    if (!Number.isFinite(S.tilt.x) || Math.hypot(S.tilt.x, S.tilt.y) > 1.0001) return "tilt out of range";
    if (S.lives < 0 || S.lives > CONFIG.MAX_LIVES) return "lives out of range";
    return null;
  }

  // Bot: shortest safe path to any fruit, otherwise the roomiest safe move.
  function botMove(core, careful) {
    const S = core.S, head = S.snake[0];
    const bad = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) if (S.occ[i]) bad[i] = 1;
    const tail = S.snake[S.snake.length - 1];
    if (!S.grow) bad[tail.y * W + tail.x] = 0;
    for (const o of S.objs) if (o.type === "ball") {
      const r = careful ? 2 : 1;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const x = o.x + dx, y = o.y + dy;
        if (x >= 0 && y >= 0 && x < W && y < H) bad[y * W + x] = 1;
      }
    }
    for (const l of S.landing) if (l.t <= 4) bad[l.y * W + l.x] = 1;
    const dist = new Int32Array(W * H).fill(-1), first = new Array(W * H);
    const q = [];
    for (const n of names) {
      if (n === OPP[S.dir]) continue;
      const x = head.x + DIRS[n].x, y = head.y + DIRS[n].y;
      if (x < 0 || y < 0 || x >= W || y >= H || bad[y * W + x]) continue;
      dist[y * W + x] = 1; first[y * W + x] = n; q.push(y * W + x);
    }
    const starts = q.slice();
    let found = null;
    for (let qi = 0; qi < q.length; qi++) {
      const k = q[qi], x = k % W, y = (k / W) | 0;
      const o = S.objAt[k];
      if (o && o.type === "fruit" && !found) { found = first[k]; break; }
      for (const n of names) {
        const nx = x + DIRS[n].x, ny = y + DIRS[n].y;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const nk = ny * W + nx;
        if (bad[nk] || dist[nk] >= 0) continue;
        dist[nk] = dist[k] + 1; first[nk] = first[k]; q.push(nk);
      }
    }
    if (found) return found;
    if (!starts.length) return S.dir;
    // No fruit reachable: head for the start cell with the most reachable space.
    let bestN = first[starts[0]], bestA = -1;
    for (const s of starts) {
      const seen = new Uint8Array(W * H); seen[s] = 1; const st = [s]; let a = 0;
      while (st.length) {
        const k = st.pop(), x = k % W, y = (k / W) | 0; a++;
        for (const n of names) {
          const nx = x + DIRS[n].x, ny = y + DIRS[n].y;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const nk = ny * W + nx;
          if (!bad[nk] && !seen[nk]) { seen[nk] = 1; st.push(nk); }
        }
      }
      if (a > bestA) { bestA = a; bestN = first[s]; }
    }
    return bestN;
  }

  const out = { violations: [], bot: [], random: { games: 0, ticks: 0 } };

  // Bot games, played to completion.
  for (let seed = 1; seed <= 40; seed++) {
    const core = createCore(seed), S = core.S;
    core.input("right");
    let ms = 0, guard = 0, maxLen = 0, maxTilt = 0, deaths = {};
    while (S.status !== "over" && S.status !== "won" && guard++ < 60000) {
      if (S.status === "dead") { deaths[S.deathReason] = (deaths[S.deathReason] || 0) + 1; core.respawn(); core.input("right"); }
      if (S.status === "ready") core.input("right");
      const mv = botMove(core, seed % 2 === 0);
      if (mv !== S.dir) core.input(mv);
      ms += core.stageCfg().tick;
      core.step();
      maxLen = Math.max(maxLen, S.snake.length);
      maxTilt = Math.max(maxTilt, Math.hypot(S.tilt.x, S.tilt.y));
      S.events.length = 0;
      const v = invariants(core);
      if (v) { out.violations.push("bot seed " + seed + " tick " + S.tick + ": " + v); break; }
    }
    if (S.status === "dead" || S.status === "over") deaths[S.deathReason] = (deaths[S.deathReason] || 0) + 1;
    out.bot.push({ seed, status: S.status, stage: S.stage, fruit: S.totalFruit, sec: Math.round(ms / 1000), ticks: S.tick,
                   maxLen, maxTilt: +maxTilt.toFixed(2), spilled: S.spilled, dumped: S.dumped, score: S.score, deaths });
  }

  // Random flailing, including illegal inputs, to shake out crashes.
  let r = 12345; const rnd = () => (r = (r * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let seed = 100; seed < 400; seed++) {
    const core = createCore(seed), S = core.S; out.random.games++;
    let guard = 0;
    while (S.status !== "over" && S.status !== "won" && guard++ < 4000) {
      if (S.status === "dead") core.respawn();
      for (let i = 0; i < 3; i++) if (rnd() < 0.3) core.input(names[(rnd() * 4) | 0]);
      core.step(); out.random.ticks++; S.events.length = 0;
      const v = invariants(core);
      if (v) { out.violations.push("random seed " + seed + " tick " + S.tick + ": " + v); break; }
    }
  }
  return out;
});
check("no rule invariant violations", sim.violations.length === 0, sim.violations.slice(0, 5).join(" | "));
const won = sim.bot.filter((b) => b.status === "won");
const avg = (a, f) => a.length ? Math.round(a.reduce((s, x) => s + f(x), 0) / a.length) : 0;
console.log("     bot: " + won.length + "/" + sim.bot.length + " games won; avg stage reached " + (sim.bot.reduce((s, b) => s + b.stage, 0) / sim.bot.length).toFixed(1));
console.log("     bot: avg winning run " + avg(won, (b) => b.sec) + "s; avg run overall " + avg(sim.bot, (b) => b.sec) + "s; avg fruit " + avg(sim.bot, (b) => b.fruit));
console.log("     bot: avg max length " + avg(sim.bot, (b) => b.maxLen) + "; avg peak tilt " + (sim.bot.reduce((s, b) => s + b.maxTilt, 0) / sim.bot.length).toFixed(2) +
            "; avg spilled " + avg(sim.bot, (b) => b.spilled) + "; avg dumped " + avg(sim.bot, (b) => b.dumped));
const deaths = {}; for (const b of sim.bot) for (const k in b.deaths) deaths[k] = (deaths[k] || 0) + b.deaths[k];
console.log("     bot: deaths by cause " + JSON.stringify(deaths));
console.log("     random play: " + sim.random.games + " games, " + sim.random.ticks + " ticks");
check("the game is winnable (bot wins at least once)", won.length > 0);
check("the tilt actually matters (objects roll off in bot play)", sim.bot.some((b) => b.spilled + b.dumped > 0));

// ---------- 2. Targeted rule tests ----------
const rules = await page.evaluate(() => {
  const { createCore, CONFIG } = window.TEETER;
  const r = {};
  const S0 = (c) => { c.S.objs.length = 0; c.S.objAt.fill(null); c.S.fruitTimer = 1e9; };
  const put = (c, type, x, y) => { const o = { id: c.S.nextId++, type, x, y, vx: 0, vy: 0, ax: 0, ay: 0, dead: false }; c.S.objs.push(o); c.S.objAt[y * c.S.W + x] = o; return o; };
  // Reversal and input buffering.
  let c = createCore(7); c.input("right");
  r.reverseRejected = c.input("left") === false;
  r.sameRejected = c.input("right") === false;
  c.input("up"); r.quickUturnBlocked = c.input("down") === false;   // up then down would be a U-turn into the neck
  r.bufferAccepts = c.input("left") === true;
  c.step(); c.step();
  r.aliveAfterBufferedTurns = c.S.status === "playing" && c.S.dir === "left";
  // Ready state: pressing "back" flips the waiting snake rather than killing it.
  c = createCore(7); c.input("left"); c.step();
  r.readyFlip = c.S.status === "playing" && c.S.dir === "left";
  // Edge death, life loss and respawn.
  c = createCore(3); c.input("right"); while (c.S.status === "playing") c.step();
  r.edgeDeath = c.S.status === "dead" && c.S.deathReason === "edge" && c.S.lives === CONFIG.LIVES - 1;
  c.respawn(); r.respawnReady = c.S.status === "ready" && c.S.snake.length === CONFIG.START_LEN && c.S.tilt.x === 0;
  // Three deaths end the game.
  for (let i = 0; i < 5 && c.S.status !== "over"; i++) { if (c.S.status === "dead") c.respawn(); c.input("right"); while (c.S.status === "playing") c.step(); }
  r.gameOver = c.S.status === "over" && c.S.lives === 0;
  c.step(); r.noStepAfterOver = c.S.status === "over";
  // Running head-first into a marble costs a life.
  c = createCore(5); S0(c); c.input("right");
  put(c, "ball", c.S.snake[0].x + 2, c.S.snake[0].y); c.step(); c.step();
  r.headIntoMarbleDies = c.S.status === "dead" && c.S.deathReason === "ball";
  // Eating grows the snake by GROW_PER_FRUIT and scores.
  c = createCore(5); S0(c); c.input("right");
  put(c, "fruit", c.S.snake[0].x + 1, c.S.snake[0].y); for (let i = 0; i < 4; i++) c.step();
  r.eatGrows = c.S.snake.length === CONFIG.START_LEN + CONFIG.GROW_PER_FRUIT && c.S.score === 10 && c.S.totalFruit === 1;
  return r;
});
for (const k of ["reverseRejected", "sameRejected", "quickUturnBlocked", "bufferAccepts", "aliveAfterBufferedTurns", "readyFlip", "edgeDeath", "respawnReady", "gameOver", "noStepAfterOver", "headIntoMarbleDies", "eatGrows"])
  check("rule: " + k, rules[k] === true);

// Physics behaviour with the tilt held fixed, so the thresholds are tested exactly.
const phys = await page.evaluate(() => {
  const { createCore, CONFIG } = window.TEETER;
  const r = {};
  function setup(tx) {
    const c = createCore(11), S = c.S;
    S.objs.length = 0; S.objAt.fill(null); S.landing.length = 0;
    const mk = (type, x, y) => { const o = { id: S.nextId++, type, x, y, vx: 0, vy: 0, ax: 0, ay: 0, dead: false }; S.objs.push(o); S.objAt[y * S.W + x] = o; return o; };
    return { c, S, mk, tx };
  }
  // Run the object physics alone by stepping a snake that walks a tight square, then overriding tilt each tick.
  function run(env, ticks) {
    const { c, S, tx } = env; const seq = ["up", "up", "left", "left", "down", "down", "right", "right"]; let i = 0;
    c.input("right");
    const fruitCap = CONFIG.STAGES[0].fruit; CONFIG.STAGES[0].fruit = 0;   // no respawns during the experiment
    for (let t = 0; t < ticks && S.status === "playing"; t++) {
      S.tilt.x = tx / (1 - CONFIG.TILT_LERP) ; S.tilt.y = 0;               // pre-compensate: step() lerps toward ~0
      c.input(seq[i++ % 8]); c.step();
    }
    CONFIG.STAGES[0].fruit = fruitCap;
  }
  let e = setup(0.2); let b = e.mk("ball", 5, 3), f = e.mk("fruit", 5, 24); run(e, 60);
  r.gentleLeanMovesBallOnly = b.x > 5 && f.x === 5;
  e = setup(0.6); b = e.mk("ball", 5, 3); f = e.mk("fruit", 5, 24); run(e, 400);
  r.steepLeanDumpsBoth = b.dead && f.dead && e.S.dumped === 1 && e.S.spilled === 1;
  e = setup(0.05); b = e.mk("ball", 5, 3); f = e.mk("fruit", 5, 24); run(e, 200);
  r.balancedNothingMoves = b.x === 5 && f.x === 5;
  // The body is a wall: a marble rolling toward a long straight body stops against it.
  e = setup(0.6); e.S.grow = 10; b = e.mk("ball", 18, 11); const free = e.mk("ball", 18, 20);   // same start column, nothing in its way
  e.c.input("up"); CONFIG.STAGES[0].fruit = 0;
  for (let t = 0; t < 13; t++) { e.S.tilt.x = 0.6 / (1 - CONFIG.TILT_LERP); e.S.tilt.y = 0; e.c.step(); }
  CONFIG.STAGES[0].fruit = 3;
  r.bodyBlocksMarble = e.S.status === "playing" && !b.dead && b.x === 19 && free.x > 20;
  r.ballSpeedCap = CONFIG.PHYS.ball.vmax < 1 && CONFIG.PHYS.fruit.vmax < CONFIG.PHYS.ball.vmax;
  return r;
});

for (const k of Object.keys(phys)) check("physics: " + k, phys[k] === true);

// ---------- 3. Real keyboard and UI ----------
const overlayVisible = () => page.evaluate(() => !document.getElementById("overlay").classList.contains("hidden"));
check("title card shown on load", await overlayVisible());
if (shotDir) await page.screenshot({ path: shotDir + "/1-title.png" });
await page.keyboard.press("ArrowRight");
check("arrow key does not start the game from the title", await page.evaluate(() => !window.TEETER.started));
await page.keyboard.press("Space");
check("Space starts a game", await page.evaluate(() => window.TEETER.started && window.TEETER.core.S.status === "ready") && !(await overlayVisible()));
await page.keyboard.press("ArrowUp");
await page.waitForTimeout(500);
let st = await page.evaluate(() => ({ s: window.TEETER.core.S.status, t: window.TEETER.core.S.tick, d: window.TEETER.core.S.dir }));
check("snake moves in real time after a direction key", st.s === "playing" && st.t >= 2 && st.d === "up", JSON.stringify(st));
await page.keyboard.press("Space");
const t1 = await page.evaluate(() => window.TEETER.core.S.tick);
await page.waitForTimeout(400);
const t2 = await page.evaluate(() => window.TEETER.core.S.tick);
check("Space pauses (no ticks while paused)", t1 === t2 && (await overlayVisible()));
await page.keyboard.press("ArrowLeft");
check("steering is ignored while paused", await page.evaluate(() => window.TEETER.core.S.queue.length === 0));
await page.keyboard.press("Space");
await page.keyboard.press("ArrowLeft");
await page.waitForTimeout(300);
check("resumes and steers after unpause", await page.evaluate(() => window.TEETER.core.S.dir === "left" && window.TEETER.core.S.status === "playing"));
// Rapid opposite taps must not cause an instant self-bite.
// Heading left: Right is a reversal (ignored), Up is fine, Down straight after Up is a reversal (ignored).
await page.keyboard.press("ArrowRight"); await page.keyboard.press("ArrowUp"); await page.keyboard.press("ArrowDown");
await page.waitForTimeout(300);
check("mashed opposite keys never reverse into the neck", await page.evaluate(() => window.TEETER.core.S.status === "playing" && window.TEETER.core.S.dir === "up"));
// Drive off the edge and go through the life-lost flow.
await page.waitForFunction(() => window.TEETER.core.S.status === "dead", null, { timeout: 15000 }).catch(() => {});
check("sliding off the edge costs a life and shows the card", (await page.evaluate(() => window.TEETER.core.S.status + ":" + window.TEETER.core.S.deathReason)) === "dead:edge" && (await overlayVisible()));
if (shotDir) await page.screenshot({ path: shotDir + "/3-life-lost.png" });
await page.keyboard.press("Space");
check("input right after death is ignored briefly", (await page.evaluate(() => window.TEETER.core.S.status)) === "dead");
await page.waitForTimeout(800);
await page.keyboard.press("Space");
check("Space respawns into the ready state", (await page.evaluate(() => window.TEETER.core.S.status)) === "ready" && !(await overlayVisible()));
// Losing focus pauses.
await page.keyboard.press("KeyD"); await page.waitForTimeout(200);
await page.evaluate(() => window.dispatchEvent(new Event("blur")));
check("losing window focus pauses the game", await page.evaluate(() => window.TEETER.paused));
await page.keyboard.press("KeyR");
check("R restarts from the pause card", await page.evaluate(() => window.TEETER.core.S.stage === 1 && window.TEETER.core.S.lives === 3 && !window.TEETER.paused));

// A mid-game picture: put the live game into a late, tilted state and photograph it.
await page.evaluate(() => {
  const c = window.TEETER.core, S = c.S;
  c.input("right");
  S.stage = 6; S.grow = 40; S.score = 1840; S.streak = 9;
  const path = [];
  for (let i = 0; i < 9; i++) path.push("right");
  for (let k = 0; k < 4; k++) { path.push("down", "down"); for (let i = 0; i < 6; i++) path.push(k % 2 ? "right" : "left"); }
  let i = 0; window.__drive = setInterval(() => { if (i < path.length) c.input(path[i++]); }, 100);
});
await page.waitForTimeout(4600);
await page.evaluate(() => clearInterval(window.__drive));
if (shotDir) await page.screenshot({ path: shotDir + "/2-play.png" });
await page.keyboard.press("Space");

// Small window: the board must still fit without scrollbars.
await page.setViewportSize({ width: 900, height: 600 });
await page.waitForTimeout(150);
const fit = await page.evaluate(() => {
  const r = document.getElementById("board").getBoundingClientRect(), h = document.getElementById("hud").getBoundingClientRect();
  return { ok: r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight && h.top >= 0, scroll: document.documentElement.scrollHeight <= innerHeight };
});
check("fits a small 900x600 window", fit.ok && fit.scroll, JSON.stringify(fit));
if (shotDir) await page.screenshot({ path: shotDir + "/4-small.png" });

check("no JavaScript errors in the page", errors.length === 0, errors.slice(0, 3).join(" | "));
await browser.close();
console.log(failed ? "\n" + failed + " check(s) FAILED" : "\nAll checks passed");
process.exit(failed ? 1 : 0);
