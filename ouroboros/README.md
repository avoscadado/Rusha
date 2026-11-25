# Ouroboros

Snake against your own past. One file, no install: double-click `ouroboros.html` on a Mac and it opens in your
default browser (Safari or Chrome). It makes no network requests and uses no libraries.

## The twist

You play six "days" of up to 56 seconds each on a 60 by 38 board (the classic Nokia board is about 20 by 20, so
this is more than five times the area).

- Fruit appears in the same places at the same moments every day, in waves of 14, and rots after about three
  seconds if nobody eats it. No single day can collect it all.
- When a day ends, the snake you just played becomes an **Echo**. On every later day it replays your exact path,
  and it eats the same fruit at the same ticks it did before. It is as long as your snake was at dusk.
- Touching an Echo kills you. You cannot eat fruit an Echo owns (they show as hollow rings in its colour). An Echo's
  next 24 moves are drawn as a dashed line so you can read where it is going.
- The goal is to harvest the whole schedule together with your past selves. A big harvest early makes a long, dangerous
  Echo for the rest of the run, so greed has a price.
- Dying rewinds the day. You start with 2 rewinds and earn one for each day you clear on the first try (up to 5).
  When they run out, the run ends.

## Controls

| | |
|---|---|
| Steer | arrow keys or WASD |
| Begin a day, continue | Space or Enter (or any arrow key to start moving) |
| Pause | P or Esc |
| Sound, fullscreen | M, F |
| Restart the run, back to title | R, Q (from the pause screen, pressed twice to confirm) |

`ouroboros.html?seed=1234` plays a fixed fruit schedule, so two people can compare the same board.

## How it is built

`ouroboros.html` holds two scripts. `core` is the pure game logic (no DOM): everything is a function of the tick number,
which is what makes Echoes exact. `app` is drawing, input and sound on a canvas.

## Tests

Node 18+ and Playwright are only needed for the tests, never for playing.

```
node ouroboros/tests/core.test.mjs          # rules, collisions, echo replay, fuzzing
node ouroboros/tests/browser-regress.mjs    # real keyboard input in headless Chromium
node ouroboros/tests/shots.mjs outdir       # plays a full run in headless Chromium and saves screenshots
```

## Balance

The fruit schedule, board size and rewind count were tuned by simulation, not by feel. `tests/balance` contains a perfect
planner (an exact search over cell, heading and tick that never dies), a human-like player (reaction delay of two or three
ticks, short lookahead, two to three percent mistyped keys) and a classic Snake baseline driven by the same skill model.
`sh ouroboros/tests/balance/shipped.sh` regenerates the numbers below for the file as shipped.

Measured on the real game logic, counting failed attempts and rewinds, at 112 ms per tick (200 to 300 seeds each, so about
plus or minus 3 points):

| | perfect planner | human-like player | very error-prone player |
|---|---|---|---|
| share of the whole fruit schedule harvested, days 1 to 6 (per day) | 26, 23, 19, 15, 10, 5 % | 23, 20, 16, 13, 9, 5 % | 20, 13, 8, 5, 3, 1 % |
| final harvest, mean | 98.7 % | 85.5 % (median 94.6 %) | 49.6 % |
| attempts that end in a death, days 2 to 5 | 0 % | 34, 36, 36, 27 % | 64, 65, 65, 60 % |
| runs that end by running out of rewinds | 0 % | 20 % | 83 % |
| play time, mean | 5.5 min | 6.3 min | 4.6 min |

- A planner that never dies still needs until day 5 to pass 90 % of the schedule and only completes all of it in about one
  run in five. Nothing is unreachable, but nobody gets it all on the first day.
- Classic Snake (20 by 20, 125 ms per move) driven by the same human-like skill model lasts 85 seconds on average (median 76).
  The same model lasts 6.3 minutes in Ouroboros, about 4.5 times as long. The error-prone model gives about 7.7 times (36 seconds for classic). Only the
  ratio means anything, because both sides use the same policy.
- A full six-day run takes at least 5.6 minutes (6 days at 56 seconds), less if the whole schedule is harvested early.
- Before this tuning the first settings (44 by 28, five days of 620 ticks) were solved by the planner by day 3 and lasted
  only about 2.3 times a classic game for the human-like player, so they were changed.

These are scripted players, not people. The numbers are good for comparing settings against each other and for showing
that the game is neither trivial nor impossible. They say less about how hard it feels to a real person, and death rates
are the least reliable figure.
