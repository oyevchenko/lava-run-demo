# Sprite sequences (hero and imp animations)

Each folder here is one animation, played by the sprite-sequence player in `game/js/render.js` instead of the static PNG.
`node tools/update-manifest.js` registers every anim listed in `index.json` in `manifest.json` / `manifest.js` (`anims`), which also makes them
work from `file://`. Over http(s) the game also reads `index.json` at runtime if the manifest has no anims yet.

- `hero_idle` and `imp_idle` load eagerly; every other anim loads lazily (one at a time after the first paint, or on first use).
  Until an anim's sheet has loaded (or if it fails), the static sprite and its code motion are drawn, so nothing ever breaks.
- Usage: `hero_idle` default; `hero_nervous` idle in circles VII-IX or on Hard/Extreme and during anticipation; `hero_impatient` on the idle nudge;
  `hero_wave` once on load (and now and then when idle); `hero_jump` on STEP (the slab-to-slab move is timed to the `airborne` frames, landing VFX on `landFrame`; after landing it lowers the arms (appended v13 clip, played at 1.8x) and ends on `hero_idle` frame 0, so the idle loop takes over without a cut);
  `hero_win` on cash-out and `hero_idol` on an idol (both hold the last frame); `hero_fall` on collapse (hidden from `exitFrame`);
  `hero_soot` after a loss on the last safe slab until the next round; `imp_idle` / `imp_cheer` (wins, idol) / `imp_giggle` (losses).

## Sprite-sheet animations (Kling clips, `tools/process-anim.py`)

The Kling character clips are packed as atlases instead of loose frames:

```
game/assets/anim/index.json            {"anims": ["hero_idle", ...]}
game/assets/anim/<name>/anim.json      {"name","fps","loop","holdLast","frameW","frameH","cols","rows","frames",
                                        "anchor","sheets":["sheet0.webp", ...], "charH", ["drawScale"],
                                        ["airborne":[a,b]] (hero_jump), ["exitFrame":n] (hero_fall)}
game/assets/anim/<name>/sheet0.webp    row-major grid, frame i at col i % cols, row floor(i / cols)
                                        (if there are several sheets, each holds "perSheet" frames)
```

- Hero frames 384x480, feet on y=456 (`anchor` [0.5, 0.95]); every hero anim uses the same character scale
  (standing hero = `charH` = 273 px tall) and the same feet/centre point, so switching anims never pops.
  `drawScale` (2.06) = spec px per frame px that makes the hero as big as the static 512x640 `hero_idle.png`
  (563 px tall): draw the frame at frameW*drawScale x frameH*drawScale with the anchor on the feet.
- Imp frames 256x256, bottom-centre anchor [0.5, 1.0] (feet 2 px above the bottom edge), standing imp 212 px.
- `loop:true` anims wrap seamlessly; `holdLast:true` (win, idol) stop on the last frame; jump / wave / fall play
  once. `hero_jump.airborne` = first/last frame with the feet off the ground; `hero_fall.exitFrame` = first frame
  where the hero has mostly disappeared into the (removed) crack.
- Rebuild: `/workspace/art-venv/bin/python tools/process-anim.py [names...]` (inputs /workspace/casino/kling_in,
  scratch + QA in /workspace/casino/kling_work).
- `hero_jump` = v05b frames + the arms-down clip v13 (`hero_land_return` in `CLIPS`, `append_to: 'hero_jump'`): v13's standing height is
  measured on its last (idle) frame, the join pair is the best `fdiff` match after the landing (v13's opening arms-up hold is skipped,
  `join_from`), its end is the frame that matches `hero_idle` frame 0, and the last 3 near-still frames are eased into that frame.
  Rebuild with `process-anim.py hero_land_return` (or `hero_jump`); the numbers land in `kling_work/report.json` (`hero_jump+hero_land_return`).
