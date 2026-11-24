# Ouroboros

Snake against your own past. One file, no install: double-click `ouroboros.html` on a Mac and it opens in your
default browser (Safari or Chrome). It makes no network requests and uses no libraries.

## The twist

You play five "days" of about 70 seconds on a board three times the size of the classic one (44 by 28).

- Fruit appears in the same places at the same moments every day, in waves, and rots if nobody eats it.
- When a day ends, the snake you just played becomes an **Echo**. On every later day it replays your exact path,
  and it eats the same fruit at the same ticks it did before. It is as long as your snake was at dusk.
- Touching an Echo kills you. You cannot eat fruit an Echo owns (they show as hollow rings in its colour).
- The goal is to harvest the whole schedule, together with your past selves. A big harvest early makes a long, dangerous
  Echo for the rest of the run, so greed has a price.
- Dying rewinds the day. You start with 3 rewinds and earn one for each day you clear on the first try (up to 5).
  When they run out, the run ends.

## Controls

| | |
|---|---|
| Steer | arrow keys or WASD |
| Begin a day, continue | Space or Enter (or any arrow key to start moving) |
| Pause | P or Esc |
| Sound, fullscreen | M, F |
| Restart the run, back to title | R, Q (from the pause screen) |

`ouroboros.html?seed=1234` plays a fixed fruit schedule, so two people can compare the same board.

## How it is built

`ouroboros.html` holds two scripts. `core` is the pure game logic (no DOM): everything is a function of the tick number,
which is what makes Echoes exact. `app` is drawing, input and sound on a canvas.

## Tests

Node 18+ and Playwright are only needed for the tests, never for playing.

```
node ouroboros/tests/core.test.mjs          # rules, collisions, echo replay, fuzzing
node ouroboros/tests/shots.mjs outdir       # plays a full run in headless Chromium and saves screenshots
```
