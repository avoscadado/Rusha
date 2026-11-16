# Kin and Stranger

A slow flight through places that do not exist, drawn as printed plates in eight inks.
Every place ends in two doors. The low one opens on the same place, changed: at night, flooded,
under snow, a long time later. The high one opens on somewhere else.

Open `index.html`. That one file is the whole piece: no libraries, no network requests, no assets.

It began as a study of [Portals](https://portals-endless-worlds.netlify.app/), an endless flythrough of
472 hand-built three.js worlds. That piece could not be out-authored in a single file, so this one goes
somewhere else: its places are generated from a seed, it can be steered, and it has its own look.

## Using it

| | |
|---|---|
| Look around | move the pointer, or drag on a touch screen; arrow keys |
| Choose a door | look at it, tap it, or press `1` (kin) or `2` (stranger); do nothing and you are carried |
| Onward | `N`: bring the doors on now |
| Stay | `L`: the doors will not open until you say |
| Sound, pause | `S`, space |
| Full bleed, gentle camera, fullscreen | `B`, `G`, `F` |
| Copy a link to this place, save the plate | `C`, `P` |
| More | `M`: the way here (click a chip to go back), and the rest |

The address bar always holds a code for the place on screen, so any place can be shared or revisited.

## How it is made

Languages: HTML, CSS, JavaScript, GLSL ES 3.00 on raw WebGL 2, and the Web Audio API.

```
index.html          the built piece (generated: do not edit)
build.mjs           folds src/ into index.html; lints the shaders
src/shell.html      the page
src/ui.css          the sheet: mat, caption, controls
src/glsl/a-head     uniforms, noise, distance helpers, set pieces
src/glsl/forms/*    one file per kind of place: its distance function and inks
src/glsl/z-main     sky, the march, plate shading, water, portals, drift
src/glsl/post/*     glow, enlargement, paper tooth
src/js/20-palettes  thirty-six hand-mixed palettes of eight inks
src/js/30-world     a world as a pure function of its key; kin changes; heirlooms; words; score
src/js/3N-form-*    how each form lays a place out from a seed, and what is said about it
src/js/40-engine    drawing, portals, crossing, the camera, the frame-rate governor
src/js/50-audio     the score
src/js/60-ui        caption, controls, the way here, saving and sharing
src/FORMS.md        the contract for writing a new form
tools/              headless test harness: stills, contact sheets, cost, interface, sound
```

**Rendering.** Each form is one fragment shader that sphere-traces a signed distance field. There are no
meshes and no textures apart from a 256 by 256 lattice of random bytes. Shading is deliberately not
photographic: light is quantised into two or three bands, shadow is its own ink and not a darkened colour,
distance is a stack of stepped haze planes, and water breaks reflections into horizontal strokes. All colour
comes from eight inks with fixed roles (sky high, sky low, glow, lit, shade, deep, paper, accent).

**Portals.** The world behind each door is drawn first, by its own shader, from a camera carried through the
door, into a target that covers only the door's rectangle on screen, and clipped exactly at the door's plane.
The world in front marches each ray only as far as the door and, if nothing was in the way, shows that pixel.
A kin world differs from its parent only in uniforms, so it costs no shader compile at all.

**Worlds.** A world is a pure function of four numbers: the place, the change, the heirloom and its age.
Each trait draws from its own named random stream, so adding a trait later does not reshuffle existing places.
The heirloom is a moon and a tune handed down a line of worlds until a stranger breaks it.

**Sound.** Synthesised, no samples: one timbre per world, a motif stated once on arrival and then left alone,
a drone that moves, a tick as each repeated thing passes, each door sounding the key of what lies behind it,
and a held pivot note through the crossing.

**Staying fast.** The plate is printed at a pixel budget and enlarged; a governor moves the budget to hold the
frame rate, sheds reflections and shadow detail before pixels, and supersamples when there is power to spare.
Every form's shader is compiled one at a time behind the start screen.

## Building and testing

```sh
node build.mjs                                   # writes index.html
node tools/shot.mjs sheet.jpg "seed={}&form=canal" --t 18 --sheet A1,A2,A3,A4,A5,A6 --cols 3
node tools/shot.mjs cost.png "seed=A1&form=canal" --t 16 --cost
node tools/cross.mjs "seed=A1&form=canal"          # steps through a crossing frame by frame, looking for a flash
node tools/ui.mjs out/ --w 390 --h 844           # the real page: start screen, panels, phone layout
node tools/fail.mjs                              # no WebGL 2; a lost and restored graphics context
sh tools/check.sh                                # all of the above, for every form
node tools/audio-test.mjs                        # renders the score offline and checks it
```

The tools need Playwright with Chromium. `tools/shot.mjs` uses a deterministic mode of the page
(`?shot=1`) in which time only moves when the harness says so.

## What has and has not been checked

Checked, in headless Chromium with software rendering: every form compiles and draws; contact sheets across
seeds; portals open, show the right worlds and are crossed cleanly in every form; kin changes; the interface
at desktop and phone sizes; march cost per pixel (30 to 50 distance evaluations on average, against a budget
of 90); the score rendered offline for clipping, clicks, silence and structure.

Not checked, because this was built without a GPU, a phone or loudspeakers: real frame rates; shader compile
times on Windows (Direct3D), macOS and mobile drivers; touch ergonomics on a real device; and what the score
actually sounds like. The code is defensive about all four, but none has been observed.
