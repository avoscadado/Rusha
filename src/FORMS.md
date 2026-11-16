# Writing a form

A form is one kind of place: a level plain of repeated things, a hall of columns. It is two files and
nothing else:

- `src/glsl/forms/NAME.glsl`: the distance function and the inks
- `src/js/3N-form-NAME.js`: how a seed lays the place out, and the words for it

`plain` and `cistern` are the worked examples. Read both before writing one.

## The look (non-negotiable)

Every world is a printed plate in eight inks. Shapes are ruled, stepped, faceted, extruded. Noise may shape a
silhouette at large scale and nothing else. No smooth-min blobs, no noise displacement on surfaces, no glow fog.
Colour comes only from `uInk[]`. The accent ink covers less than a twentieth of the picture.
One loud thing per world: a set piece, or an exception among repeated things, or an event. Not all three at full volume.

## GLSL contract

The file is pasted between `a-head.glsl` and `z-main.glsl`. It must define:

```glsl
#define FAR   ...   // how far rays go, in metres
#define STEPK ...   // 0.9 to 0.95 for exact distances, 0.5 to 0.7 for heightfields and anything bent
#define SHFAR ...   // how far shadow rays go
float shafts(vec3 ro, vec3 rd, float t, float jit);  // light shafts 0..1, or return 0.0
float map(vec3 p);                                   // distance to the nearest surface; must set gD
Surf  surf(vec3 p, vec3 n, float t);                 // inks at a hit: Surf(lit, shade, glow, line)
```

Rules the build enforces: no `texture()`, `dFdx`, `dFdy`, `fwidth`, `fract(sin())`, `continue`, `switch`, `while`,
and no call to `map()` from a form (z-main calls it from exactly three places).

Rules you must keep yourself:

- `smoothstep(a, b, x)` needs `a < b`. For a falling edge write `1.0 - smoothstep(lo, hi, x)`.

- `map()` is run about a hundred times a pixel. `vnoise()` costs four texel fetches: at most one or two per call.
  Prefer arithmetic: `mod`, `stairs()`, sums of sines, boxes.
- Never return more than the true distance. If cells differ from their neighbours, step with `cellExit()`
  (see plain) and set `gD` to the distance without that step, so ink lines stay on real edges.
- `gD` must be the distance to real surfaces. If `map()` takes a shortcut ("this point is above everything, step
  down to the roofline"), return the safe step but set `gD` to something large: shadows and ink lines read `gD`,
  and a made-up small value there draws false shadows.
- Far small things must sink or thin out before they are thinner than a pixel (see the `lod` line in plain).
- The flight line is `pathXY(z)` for every z from -50 to 60000. A tube of at least 2.5 m around it must be empty,
  and so must the two portals: discs of radius `g.door.r` facing +z, centred on the line plus `g.door.kin` and
  plus `g.door.stranger`, wherever along z they are placed.
- Call `setPiece(p)` in `map()` and `setSurf(p)` in `surf()` if the form allows a set piece.
- Water is not yours: set `g.sea` and the engine draws it, reflections included.

Helpers in a-head: `vnoise`, `vnoise1`, `vnoise2`, `cell4`, `cell1`, `ign`, `rot`, `sdBox`, `sdBox2`, `sdCyl`,
`sdTorus`, `sdSeg`, `stairs`, `pathXY`, `cellExit`, `cellExitZ` (for forms that repeat along z only), `setPiece`, `setSurf`. Uniforms you may read: `uTr[16]`
(your traits), `uEv.x` (event progress 0..1), `uSea`, `uTime`, `uCamP` (for level of detail), `uSunDir`, `uPix`, `uInk[8]`
with indices `TOP LOW GLOW LIT SHADE DEEP PAPER ACCENT`.

## JS contract

```js
FORMS.name = {
  weight: 1,                 // 0 while unfinished: it is then never picked at random
  hours: [0, 1, 2],          // optional: which palette hours suit it (0 night, 1 dawn or dusk, 2 day)
  mist: false, snow: false, flood: false, drain: false,   // optional: kin changes that make no sense here
  build(g, S) { ... },       // S(label) gives a seeded random stream; set the fields below
  words(g) { return { name, line }; },
  changeLines: { later: '...', flooded: '...' },          // optional: better sentences for kin changes
  empty(g, r) {}, later(g, r) {}, night(g, r) {},         // optional: what those kin changes do here
};
```

Draw each independent trait from its own stream (`S('sway')`, `S('odd')`) where you can: a stream added later then
leaves every existing place as it was.

`build` sets: `g.tr` (16 floats), `g.path` (`ax fx px` sideways sine, `ay fy py` vertical sine, `y0` height),
`g.speed` (m/s), `g.lead` (how far ahead the camera looks), `g.tilt`, `g.focal`, `g.sea` `[mode, level, ripple, 0]`
(mode 0 none, 1 water, 2 mirror, 3 a sea of mist), `g.air` `[haze density, haze planes, mist top, mist density]`,
`g.set` (a set piece; `type` 0 for none), `g.ev` (`{ id, type, t0, dur }`, type one of `none rise lights tide mist
sunset snow`), `g.door` (`{ r, kin: [x, y], stranger: [x, y] }`), `g.pulse` (metres between repeated things, for the
sound), `g.floodTo`, `g.mistTop`, `g.timbres`, `g.space`, `g.interior`, `g.fill`, and `g.facts`: the measured numbers
the words will state.

## Words

A name and at most three short sentences. Present tense. A fact, then its consequence. State numbers the picture
really shows (`numWord(n)`). Plain surveyor's names: The Long Cistern, Nine Pylons, Low Water at the Stair.
Never: ethereal, ancient, forgotten, endless, whisper, dream, realm, mysterious, "of the" names.

## Testing

```sh
node build.mjs /tmp/x/index.html
node tools/shot.mjs sheet.jpg "seed={}&form=NAME" --page /tmp/x/index.html --t 16 --sheet A1,A2,A3,A4,A5,A6 --cols 3
node tools/shot.mjs cost.png "seed=A1&form=NAME" --page /tmp/x/index.html --t 16 --cost     # px.r is mean march cost * 255 / 200
node tools/shot.mjs doors.jpg "seed=A1&form=NAME" --page /tmp/x/index.html --t 39,47,51,52.6,53.2,55 --cols 3
node tools/shot.mjs kin.jpg "seed=A1&form=NAME&change={}" --page /tmp/x/index.html --t 16 --sheet 11,22,33,44,55,66
```

A form is done when twelve seeds give twelve plates worth keeping, the mean cost is under 90 map calls a pixel
(`px.r` under 115) with `px.over` under 0.03, nothing intersects the flight line or the portals, and its kin
changes all still look right.
