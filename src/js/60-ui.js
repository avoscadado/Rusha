// ---------- the sheet: caption, controls, the way here, sound ----------
const $ = (id) => document.getElementById(id);
const hasAudio = typeof AUDIO !== 'undefined';

const UI = {
  store: { v: 1, sound: false, bleed: false, gentle: null, hints: 0, plates: [] },
  plates: [],            // the way here: { n, key, name, kind, inks }
  here: 0,
  soundOn: false,
  idleT: 0,

  load() {
    try {
      const s = JSON.parse(localStorage.getItem('kas.v1') || 'null');
      if (s && s.v === 1) Object.assign(this.store, s);
    } catch (e) { /* storage is optional */ }
    if (!Array.isArray(this.store.plates)) this.store.plates = [];
  },
  save() {
    clearTimeout(this._st);
    this._st = setTimeout(() => {
      try { this.store.plates = this.plates.slice(-120); localStorage.setItem('kas.v1', JSON.stringify(this.store)); } catch (e) { /* full or blocked */ }
    }, 400);
  },

  toast(msg, ms = 2600) {
    const t = $('toast'); t.textContent = msg; t.classList.add('on');
    clearTimeout(this._tt); this._tt = setTimeout(() => t.classList.remove('on'), ms);
  },
  hint(msg, ms = 9000) {
    const h = $('cap-hint');
    if (!msg) { h.classList.remove('on'); return; }
    h.textContent = msg; h.classList.add('on');
    clearTimeout(this._ht); if (ms) this._ht = setTimeout(() => h.classList.remove('on'), ms);
  },

  // the sheet takes the colour of the world's own paper; night plates are mounted on dark card
  mount(g) {
    const night = g.pal.hour === 0;
    const paper = night ? V.mix(g.pal.deep, g.pal.shade, 0.35) : V.mix(g.pal.paper, [1, 1, 1], 0.25);
    const ink = night ? V.mix(g.pal.paper, g.pal.low, 0.12) : V.mix(g.pal.deep, [0, 0, 0], 0.25);
    const st = document.documentElement.style;
    st.setProperty('--paper', cssColor(paper)); st.setProperty('--ink', cssColor(ink));
    st.setProperty('--soft', cssColor(ink, 0.6)); st.setProperty('--hair', cssColor(ink, 0.2));
    st.setProperty('--accent', cssColor(night ? V.mix(g.pal.accent, g.pal.paper, 0.15) : g.pal.accent));
    const meta = document.querySelector('meta[name=theme-color]'); if (meta) meta.content = cssColor(paper);
  },

  caption(w, kind) {
    const g = w.g, cap = $('caption');
    const n = this.plates.length ? this.plates[this.here].n : 1;
    const from = kind === 'kin' ? `Kin of plate ${n - 1}` : kind === 'stranger' ? 'A stranger' : kind === 'again' ? 'Again' : '';
    cap.classList.add('turning');
    clearTimeout(this._ct);
    this._ct = setTimeout(() => {
      $('cap-no').textContent = `Plate ${n}` + (from ? `  ·  ${from}` : '') + `  ·  ${g.pal.name}`;
      $('cap-name').textContent = g.name;
      $('cap-line').textContent = g.line;
      document.title = `${g.name} · Kin and Stranger`;
      cap.classList.remove('turning');
    }, 380);
    this.mount(g);
    try { history.replaceState(null, '', '#' + WORLD.code(w.key)); } catch (e) { /* file: pages may refuse */ }
  },

  record(w, kind) {
    const g = w.g, last = this.plates[this.here];
    const n = last ? last.n + 1 : 1;
    // going on from an earlier plate starts a new line from there
    if (this.plates.length && this.here < this.plates.length - 1) this.plates.length = this.here + 1;
    this.plates.push({ n, key: { base: w.key.base, change: w.key.change, heir: w.key.heir, age: w.key.age }, name: g.name, kind,
      inks: [g.pal.top, g.pal.low, g.pal.lit, g.pal.shade, g.pal.accent].map((c) => cssColor(c)) });
    this.here = this.plates.length - 1;
    this.drawLine(); this.save();
  },

  drawLine() {
    const box = $('line'); box.textContent = '';
    this.plates.forEach((p, i) => {
      const a = document.createElement('a');
      a.setAttribute('role', 'listitem'); a.tabIndex = 0; a.title = `Plate ${p.n}: ${p.name}`;
      a.className = (p.kind === 'stranger' ? 'stranger ' : '') + (i === this.here ? 'here' : '');
      const c = p.inks;
      const sw = document.createElement('i');
      sw.style.background = `linear-gradient(${c[0]} 0 34%, ${c[1]} 34% 56%, ${c[2]} 56% 78%, ${c[3]} 78% 92%, ${c[4]} 92% 100%)`;
      a.append(sw, document.createTextNode(String(p.n)));
      const go = () => this.jump(i);
      a.addEventListener('click', go);
      a.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
      box.append(a);
    });
    box.scrollTop = box.scrollHeight;
  },

  jump(i) {
    const p = this.plates[i]; if (!p || i === this.here) return;
    this.here = i;
    ENG.goTo({ ...p.key, gen: 0 }, { step: p.n, kind: 'again' });
    this.drawLine();
    this.toast(`Plate ${p.n}`);
  },

  // ---- sound ----
  setSound(on) {
    if (!hasAudio) { this.toast('No sound in this browser'); return; }
    if (on && !AUDIO.ready) { if (!AUDIO.init()) { this.toast('No sound in this browser'); return; } if (ENG.cur) AUDIO.enter(ENG.cur.g.audio); }
    this.soundOn = !!on; AUDIO.setEnabled(this.soundOn);
    $('b-sound').setAttribute('aria-pressed', String(this.soundOn));
    this.store.sound = this.soundOn; this.save();
  },

  setPaused(on) {
    ENG.paused = !!on; $('b-pause').setAttribute('aria-pressed', String(ENG.paused));
    $('b-pause').textContent = ENG.paused ? 'Resume' : 'Pause';
    if (hasAudio && AUDIO.ready) AUDIO.setPaused(ENG.paused);
  },
  setBleed(on) { document.body.classList.toggle('bleed', !!on); $('b-bleed').setAttribute('aria-pressed', String(!!on)); this.store.bleed = !!on; this.save(); requestAnimationFrame(() => ENG.resize()); },
  setGentle(on) { ENG.gentle = !!on; $('b-gentle').setAttribute('aria-pressed', String(!!on)); this.store.gentle = !!on; this.save(); },
  setStay(on) { ENG.linger = !!on; $('b-stay').setAttribute('aria-pressed', String(!!on)); this.toast(on ? 'Staying. The doors will wait.' : 'Going on.'); },
  setMore(on) {
    $('more').hidden = !on; $('b-more').setAttribute('aria-expanded', String(!!on));
    if (on) { this.drawLine(); this.stat(); }
  },
  stat() {
    const mp = (ENG.rw * ENG.rh / 1e6).toFixed(2);
    $('stat').textContent = `${ENG.rw} × ${ENG.rh}  ·  ${mp} MP` + (ENG.stats.fps ? `  ·  ${Math.round(ENG.stats.fps)} fps` : '') + `  ·  ${WORLD.code(ENG.cur ? ENG.cur.key : { base: 0 })}`;
  },
  onward() {
    if (ENG.doors) { ENG.hurry = true; return; }
    ENG.hurry = true; ENG.linger = false; $('b-stay').setAttribute('aria-pressed', 'false');
    this.toast('The doors are coming');
  },

  async copyLink() {
    const url = location.href.split('#')[0] + '#' + WORLD.code(ENG.cur.key);
    try { await navigator.clipboard.writeText(url); this.toast('Link copied'); }
    catch (e) { this.toast(WORLD.code(ENG.cur.key), 6000); }
  },

  // Save the plate as it would be printed: mounted, with its caption beneath.
  photo() {
    const w = ENG.cur; if (!w) return;
    ENG.render();
    const src = $('view'), g = w.g;
    const m = Math.round(src.width * 0.035), capH = Math.round(src.width * 0.105);
    const c = document.createElement('canvas'); c.width = src.width + m * 2; c.height = src.height + m + capH;
    const x = c.getContext('2d'), cs = getComputedStyle(document.documentElement);
    x.fillStyle = cs.getPropertyValue('--paper'); x.fillRect(0, 0, c.width, c.height);
    x.drawImage(src, m, m);
    x.fillStyle = cs.getPropertyValue('--ink'); x.textBaseline = 'top';
    const u = src.width / 1000;
    x.font = `600 ${Math.round(10 * u)}px ui-sans-serif, system-ui, sans-serif`;
    x.globalAlpha = 0.6; x.fillText(`PLATE ${this.plates[this.here] ? this.plates[this.here].n : 1}   ·   ${g.pal.name.toUpperCase()}   ·   ${WORLD.code(w.key)}`, m, m + src.height + 16 * u);
    x.globalAlpha = 1; x.font = `${Math.round(24 * u)}px "Iowan Old Style", Palatino, Georgia, serif`;
    x.fillText(g.name, m, m + src.height + 34 * u);
    x.font = `${Math.round(13.5 * u)}px "Iowan Old Style", Palatino, Georgia, serif`;
    x.fillText(g.line.length > 150 ? g.line.slice(0, 149) + '…' : g.line, m, m + src.height + 68 * u, src.width);
    c.toBlob((blob) => {
      if (!blob) { this.toast('Could not save the plate'); return; }
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = g.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.png';
      document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      this.toast('Plate saved');
    }, 'image/png');
  },

  fullscreen() {
    const d = document, el = d.documentElement;
    if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
    else { const f = el.requestFullscreen || el.webkitRequestFullscreen; if (f) f.call(el).catch(() => {}); }
  },

  // ---- wiring ----
  wire() {
    const canvas = $('view');
    $('b-sound').onclick = () => this.setSound(!this.soundOn);
    $('b-pause').onclick = () => this.setPaused(!ENG.paused);
    $('b-next').onclick = () => this.onward();
    $('b-more').onclick = () => this.setMore($('more').hidden);
    $('b-copy').onclick = () => this.copyLink();
    $('b-photo').onclick = () => this.photo();
    $('b-stay').onclick = () => this.setStay(!ENG.linger);
    $('b-bleed').onclick = () => this.setBleed(!document.body.classList.contains('bleed'));
    $('b-gentle').onclick = () => this.setGentle(!ENG.gentle);
    $('b-full').onclick = () => this.fullscreen();

    // looking: the pointer leads the eye; on touch, drag
    const lookTo = (cx, cy, rect) => {
      const L = ENG.look;
      L.tyaw = clamp(((cx - rect.left) / rect.width - 0.5) * 1.1, -0.62, 0.62);
      L.tpitch = clamp((0.5 - (cy - rect.top) / rect.height) * 0.55, -0.3, 0.34);
      L.idle = 0;
    };
    let drag = null;
    canvas.addEventListener('pointermove', (e) => {
      this.wake();
      if (e.pointerType === 'mouse') lookTo(e.clientX, e.clientY, canvas.getBoundingClientRect());
      else if (drag) {
        const L = ENG.look;
        L.tyaw = clamp(drag.yaw - (e.clientX - drag.x) / canvas.clientWidth * 1.5, -0.62, 0.62);
        L.tpitch = clamp(drag.pitch + (e.clientY - drag.y) / canvas.clientHeight * 0.9, -0.3, 0.34);
        L.idle = 0;
      }
    });
    canvas.addEventListener('pointerdown', (e) => {
      this.wake();
      if (!$('more').hidden) { this.setMore(false); return; }
      drag = { x: e.clientX, y: e.clientY, yaw: ENG.look.tyaw, pitch: ENG.look.tpitch, t: performance.now() };
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* not capturable */ }
    });
    canvas.addEventListener('pointerup', (e) => {
      // a tap on a door chooses it
      if (drag && performance.now() - drag.t < 350 && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 9 && ENG.doors) {
        const r = canvas.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width * ENG.rw, py = (1 - (e.clientY - r.top) / r.height) * ENG.rh;
        const cam = ENG.camera(ENG.cur);
        for (let k = 0; k < 2; k++) {
          const b = ENG.doorRect(cam, ENG.doors.d[k], ENG.doors.open);
          if (b && px >= b[0] && px <= b[0] + b[2] && py >= b[1] && py <= b[1] + b[3]) { ENG.choose(k); break; }
        }
      }
      drag = null;
    });
    canvas.addEventListener('pointerleave', () => { drag = null; });

    window.addEventListener('keydown', (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (!$('veil').classList.contains('gone') && !$('veil').classList.contains('open')) { if (e.key === 'Enter') { e.preventDefault(); this.begin(false); } return; }
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key, L = ENG.look;
      const nudge = (dy, dp) => { L.tyaw = clamp(L.tyaw + dy, -0.62, 0.62); L.tpitch = clamp(L.tpitch + dp, -0.3, 0.34); L.idle = 0; };
      const tag = (e.target && e.target.tagName) || '';
      if ((k === ' ' || k === 'Enter') && (tag === 'BUTTON' || tag === 'A')) return;
      let used = true;
      if (k === ' ') this.setPaused(!ENG.paused);
      else if (k === 's') this.setSound(!this.soundOn);
      else if (k === 'n') this.onward();
      else if (k === 'm') this.setMore($('more').hidden);
      else if (k === 'b') this.setBleed(!document.body.classList.contains('bleed'));
      else if (k === 'g') this.setGentle(!ENG.gentle);
      else if (k === 'l') this.setStay(!ENG.linger);
      else if (k === 'f') this.fullscreen();
      else if (k === 'c' && !ARTIFACT) this.copyLink();
      else if (k === 'p' && !ARTIFACT) this.photo();
      else if (k === '1') ENG.choose(0);
      else if (k === '2') ENG.choose(1);
      else if (k === 'ArrowLeft') nudge(-0.16, 0);
      else if (k === 'ArrowRight') nudge(0.16, 0);
      else if (k === 'ArrowUp') nudge(0, 0.1);
      else if (k === 'ArrowDown') nudge(0, -0.1);
      else if (k === 'Escape') this.setMore(false);
      else used = false;
      if (used) { e.preventDefault(); this.wake(); }
    });
    window.addEventListener('pointermove', () => this.wake(), { passive: true });
    document.addEventListener('visibilitychange', () => {
      this.hidden = document.hidden;
      if (!document.hidden && this.begun) this.keepAwake();
      if (hasAudio && AUDIO.ready && this.soundOn) AUDIO.setEnabled(!document.hidden);
    });
    if (ARTIFACT) { $('b-copy').hidden = true; $('b-photo').hidden = true; }
    $('go-sound').onclick = () => this.begin(true);
    $('go-quiet').onclick = () => this.begin(false);
  },
  wake() { this.idleT = 0; document.body.classList.remove('idle'); },

  // the first world is ready behind the veil: show it through a hole, and offer the two ways in
  offer() {
    $('veil-sub').textContent = 'a survey of places that do not exist';
    $('veil-go').hidden = false; $('veil-note').hidden = false;
    $('veil').classList.add('peek');
    $('go-sound').focus({ preventScroll: true });
  },
  begin(withSound) {
    if (this.begun) return; this.begun = true;
    const veil = $('veil');
    veil.classList.add('open'); veil.querySelector('#veil-in').style.cssText = 'transition:opacity .6s ease;opacity:0';
    setTimeout(() => veil.classList.add('gone'), 2700);
    if (withSound) this.setSound(true);
    ENG.started = true; if (ENG.cur) ENG.cur.ta = 0;
    this.keepAwake();

  },

  // ask the screen to stay on while the flight runs; many places refuse, which is fine
  keepAwake() {
    try {
      if (navigator.wakeLock && !document.hidden) navigator.wakeLock.request('screen').then((l) => { this._wl = l; }).catch(() => {});
    } catch (e) { /* not available */ }
  },

  // called by the engine
  arrive(w, kind) {
    if (kind !== 'again') this.record(w, kind || 'first');
    this.caption(w, kind || '');
    this.hint('');
  },
  doorsOpen() {
    const n = this.store.hints || 0;
    if (n < 3) {
      this.hint('Two doors. The low one is this place, changed. The high one is somewhere else. Look at one to choose it.', 13000);
      this.store.hints = n + 1; this.save();
    } else this.hint('Two doors.', 6000);
  },
  chose(k) { this.hint(k === 0 ? 'Kin: this place, changed.' : 'A stranger: somewhere else.', 5000); },

  frame(dt) {
    this.idleT += dt;
    if (this.idleT > 4.5 && $('more').hidden) document.body.classList.add('idle');
    if (!$('more').hidden && (ENG.frame & 31) === 0) this.stat();
    if (hasAudio && AUDIO.ready) {
      const D = ENG.doors, w = ENG.cur;
      if (D && w) {
        const left = Math.max(0, D.z - w.z), far = w.g.speed * 15;
        const near = sat(1 - left / far) * D.open;
        AUDIO.portals(near * (D.chosen === 0 ? 1 : 0.55), near * (D.chosen === 1 ? 1 : 0.55), D.gaze[0], D.gaze[1]);
      } else AUDIO.portals(0, 0, 0, 0);
      AUDIO.tick();
    }
  },
};
