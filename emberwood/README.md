# Emberwood

Snake, in a forest that is on fire. Your trail is the firebreak.

## Play it on a Mac

Double-click `Emberwood.html`. It opens in your browser (Safari, Chrome or Firefox all work) and the game starts.
There is nothing to install: the whole game is that one file, with no libraries, downloads or network access.

If double-clicking opens it in a text editor instead, right-click the file, choose **Open With**, and pick Safari.

## The twist

In classic Snake the board is inert and the only thing that changes is you. In Emberwood the board is alive.

- Your head clears every tree it moves into. The bare ground you leave behind is permanent.
- Lightning (marked a few seconds ahead by pulsing rings) sets the forest on fire. Fire spreads tree to tree, much faster downwind, and the wind turns during a season.
- Fire cannot cross bare ground, meadow, ash, rock or water. So the trail you carve as a snake is your firebreak. You contain fires by drawing lines around and ahead of them.
- Pushing through trees is slower than moving over open ground, and every tree you clear costs half as much forest as a tree that burns. So your old trails become roads, and you end up building a road network and a firebreak network at the same time, carving only where it pays.
- When the HUD says embers fly, strong wind throws sparks over one-cell breaks. Cut two wide on the downwind side.
- Clearing a lightning mark before it lands grounds the bolt.

Each season ends when the storm has passed and the last flame is out. Keep the forest above that season's target or lose a life.
Fruit makes you longer and scores points. A blue dew drop brings rain that puts out fire nearby.
Running into fire, rock, water, the edge or your own body costs a life. You have three, and you earn one more for every three seasons cleared.

## Controls

| | |
|---|---|
| Steer | arrow keys or WASD |
| Pause | Space, P or Esc |
| Quit to title (while paused) | Q |
| Sound on or off | M |
| How to play (title screen) | H |

## Length

There are ten seasons. Each lasts about 60 to 85 seconds of play, so a full run is around 15 to 20 minutes once you count retries and the screens in between. After season ten you can carry on into endless seasons.

## Tests (for developers)

`tests/run-tests.js` drives the game in headless Chromium with Playwright. It checks the maps, movement, fire spread (including that a one-cell trail always holds fire), strikes, dew, the season flow and the real keyboard path, and it runs a long randomised fuzz pass with invariant checks.

```bash
node tests/run-tests.js
```
