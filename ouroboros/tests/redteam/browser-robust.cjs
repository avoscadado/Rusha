// Robustness: localStorage throwing / poisoned, AudioContext missing or throwing, missing matchMedia / fullscreen, odd ?seed values.
// Each case plays: title -> game -> die -> (rewinds) -> game over, and reports page errors and whether the rAF loop is still alive.
// Run: node tests/redteam/browser-robust.cjs
const { launch, open, AUTOPILOT } = require('./lib.cjs');

const CASES = [
  ['baseline', '', '?seed=7'],
  ['localStorage getter throws', `Object.defineProperty(window,'localStorage',{get(){throw new DOMException('denied','SecurityError')}})`, '?seed=7'],
  ['localStorage.setItem throws (quota)', `Storage.prototype.setItem=function(){throw new DOMException('full','QuotaExceededError')}`, '?seed=7'],
  ['stored best = garbage text', `Storage.prototype.getItem=function(){return 'not json'}`, '?seed=7'],
  ['stored best = 5 (number)', `Storage.prototype.getItem=function(k){return k==='ouroboros.best.v1'?'5':null}`, '?seed=7'],
  ['stored best = "x" (string)', `Storage.prototype.getItem=function(k){return k==='ouroboros.best.v1'?'"x"':null}`, '?seed=7'],
  ['stored best = true', `Storage.prototype.getItem=function(k){return k==='ouroboros.best.v1'?'true':null}`, '?seed=7'],
  ['stored best = {score:"abc"}', `Storage.prototype.getItem=function(k){return k==='ouroboros.best.v1'?'{"score":"abc","ratio":"z"}':null}`, '?seed=7'],
  ['no AudioContext', `delete window.AudioContext; delete window.webkitAudioContext`, '?seed=7'],
  ['AudioContext ctor throws', `window.AudioContext=function(){throw new Error('no audio device')}; delete window.webkitAudioContext`, '?seed=7'],
  ['AudioContext methods throw', `window.AudioContext=function(){this.state='suspended';this.sampleRate=44100;this.currentTime=0;this.destination={};this.resume=()=>{throw new Error('x')};this.createGain=()=>{throw new Error('y')}}`, '?seed=7'],
  ['AudioContext resume() rejects', `window.AudioContext=function(){this.state='suspended';this.sampleRate=44100;this.currentTime=0;this.destination={};this.resume=()=>Promise.reject(new Error('blocked'));this.createGain=()=>({gain:{value:0,setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){}})}`, '?seed=7'],
  ['no matchMedia', `window.matchMedia=undefined`, '?seed=7'],
  ['no fullscreen API', `Element.prototype.requestFullscreen=undefined;Element.prototype.webkitRequestFullscreen=undefined;document.exitFullscreen=undefined`, '?seed=7'],
  ['devicePixelRatio = 0', `Object.defineProperty(window,'devicePixelRatio',{get:()=>0})`, '?seed=7'],
  ['devicePixelRatio = 3.5', `Object.defineProperty(window,'devicePixelRatio',{get:()=>3.5})`, '?seed=7'],
  ['seed=0', '', '?seed=0'],
  ['seed=4294967295', '', '?seed=4294967295'],
  ['seed=99999999999999999999', '', '?seed=99999999999999999999'],
  ['seed=-5 (ignored)', '', '?seed=-5'],
  ['seed=1.5', '', '?seed=1.5'],
  ['seed= (empty)', '', '?seed='],
  ['two seed params', '', '?x=1&seed=9&seed=10'],
  ['no query', '', '']
];

(async () => {
  const browser = await launch(); let fails = 0;
  for (const [name, init, query] of CASES) {
    const A = await open(browser, { w: 1000, h: 650, query, init });
    const page = A.page; await page.evaluate(AUTOPILOT);
    let note = '';
    try {
      await A.frames(5, 16); await A.key('Space'); await A.frames(5, 16);              // title -> ready
      note += 'phase=' + await A.phase() + ' fruit=' + await page.evaluate(() => window.__ouro.game && window.__ouro.game.total) + ' seed=' + await page.evaluate(() => window.__ouro.game && window.__ouro.game.seed);
      // play a clean day, then die repeatedly to reach the end screen
      await page.evaluate(() => { const O = window.__ouro; O.onDir(O.game.run.dir === 1 ? 0 : 1); let n = 0; while (O.phase === 'play' && n++ < 1000) { const d = window.RT_pick(O.game, window.Ouro.DIRS); if (d !== null) O.game.input(d); O.tickOnce(); } });
      await A.frames(5, 100); await A.key('Space'); await A.frames(60, 100); await A.key('Space'); await A.frames(5, 100);
      for (let k = 0; k < 8 && (await A.phase()) !== 'final'; k++) {
        await page.evaluate(() => { const O = window.__ouro; if (O.phase === 'ready') O.onConfirm(); let n = 0; while (O.phase === 'play' && n++ < 200) { O.game.input(O.game.run.dir === 0 ? 1 : 0); O.tickOnce(); } });
        await A.frames(30, 50); await A.key('Space'); await A.frames(30, 50);
      }
      await A.frames(40, 50);
      const ph = await A.phase(); note += ' end=' + ph;
      const alive = await page.evaluate(() => window.__rafPending());
      if (!alive) note += '  *** RENDER LOOP DEAD (no rAF pending) ***';
      await A.key('KeyF'); await A.key('KeyM');
    } catch (e) { note += ' HARNESS ERROR ' + String(e.message).split('\n')[0]; }
    const bad = A.errors.length || /DEAD|HARNESS/.test(note);
    if (bad) fails++;
    console.log((bad ? 'FAIL ' : 'ok   ') + name.padEnd(36) + note + (A.errors.length ? '\n       ' + [...new Set(A.errors)].slice(0, 3).join('\n       ') : ''));
    await A.close();
  }
  await browser.close();
  console.log(fails + ' failing cases');
})();
