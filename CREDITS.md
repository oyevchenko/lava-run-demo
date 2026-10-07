# Credits and licenses — Lava Run: Inferno

Everything shipped in `game/` is either original work made for this project or third-party material under a permissive license.
No copyrighted material is used. The mood-board images in `design/refs/` are reference only, are **not** part of the game and are not committed (see `.gitignore`).

## Code, art and music (original)

- **Game code, renderer and all code-drawn art** (hero, slabs, columns, braziers, imps, idol, arches, nine circle backdrops, lava/ice/swamp textures, UI chrome): original, written for this project (`game/js/**`, `game/css/`).
- **Background music:** an original generative score composed for this game and synthesized live with WebAudio (`game/js/audio.js`): D-minor/Dorian lyre arpeggios (Karplus-Strong), pad, bass, frame drum (maqsum pattern), pan-flute melody, bells; layers, tempo and filter rise as the run descends through the nine circles, plus per-circle ambience (wind, rain, swamp bubbles, crackle, icy shimmer). No samples.
- **Synthesized SFX:** whooshes, heartbeat/drum-roll anticipation, lava sizzle and bubbles, imp giggle, firework pops, plus synth fallbacks for every sample (used on `file://`).
- **Painted art** (`game/assets/img/`, from the sources in `design/inferno/src/`): hero poses, slab, idol, coin, imps, columns, brazier, the nine circle backdrops, the logo and the UI kit were
  AI-generated concept art made for this project and supplied by the project owner (style references: our own `design/inferno/hero-sheet.jpg` and `key-art-mockup.jpg`; no third-party artwork, characters or logos).
  They were processed by `tools/process-art.py` (background removal with rembg, MIT license, using the IS-Net `isnet-general-use` model, Apache-2.0; these tools only cut the images out).
  `slab_cracked` is derived from our slab with drawn cracks. Every other bitmap in `design/inferno/ASSET_SPECS.md` falls back to the original code-drawn version.

## Sound effects — Kenney (CC0 1.0 Universal, public domain)

By Kenney Vleugels, [kenney.nl](https://kenney.nl) — packs *Interface Sounds*, *Impact Sounds*, *RPG Audio*, *Casino Audio*, *Music Jingles*. Converted from OGG to mono MP3 (44.1 kHz) with ffmpeg, otherwise unmodified. License text: `game/assets/licenses/Kenney-CC0.txt`. Attribution is not required; given here anyway.

| File (`game/assets/audio/`) | Source pack - original file | License |
|---|---|---|
| `ui_click.mp3` | "Interface Sounds" - click_002.ogg | CC0 1.0 |
| `ui_toggle.mp3` | "Interface Sounds" - toggle_001.ogg | CC0 1.0 |
| `jump_cloth.mp3` | "RPG Audio" - cloth1.ogg | CC0 1.0 |
| `land_1.mp3` | "Impact Sounds" - footstep_concrete_001.ogg | CC0 1.0 |
| `land_2.mp3` | "Impact Sounds" - footstep_concrete_003.ogg | CC0 1.0 |
| `sparkle.mp3` | "Interface Sounds" - glass_002.ogg | CC0 1.0 |
| `sparkle_long.mp3` | "Interface Sounds" - glass_004.ogg | CC0 1.0 |
| `coin_1.mp3` | "Casino Audio" - chips-collide-1.ogg | CC0 1.0 |
| `coin_2.mp3` | "Casino Audio" - chips-collide-3.ogg | CC0 1.0 |
| `coin_stack.mp3` | "Casino Audio" - chips-stack-3.ogg | CC0 1.0 |
| `coins_burst.mp3` | "RPG Audio" - handleCoins.ogg | CC0 1.0 |
| `coins_small.mp3` | "RPG Audio" - handleCoins2.ogg | CC0 1.0 |
| `tick.mp3` | "Interface Sounds" - tick_001.ogg | CC0 1.0 |
| `circle_bell.mp3` | "Impact Sounds" - impactBell_heavy_001.ogg | CC0 1.0 |
| `crack_1.mp3` | "Impact Sounds" - impactMining_001.ogg | CC0 1.0 |
| `crack_2.mp3` | "Impact Sounds" - impactMining_003.ogg | CC0 1.0 |
| `splash_thud.mp3` | "Impact Sounds" - impactSoft_heavy_001.ogg | CC0 1.0 |
| `sting_loss.mp3` | "Music Jingles" - jingles_PIZZI07.ogg (descending comic pizzicato) | CC0 1.0 |
| `sting_idol.mp3` | "Music Jingles" - jingles_PIZZI04.ogg | CC0 1.0 |
| `win_nice.mp3` | "Music Jingles" - jingles_PIZZI10.ogg | CC0 1.0 |
| `win_big.mp3` | "Music Jingles" - jingles_PIZZI02.ogg | CC0 1.0 |
| `win_mega.mp3` | "Music Jingles" - jingles_STEEL10.ogg | CC0 1.0 |
| `win_epic.mp3` | "Music Jingles" - jingles_STEEL02.ogg | CC0 1.0 |

## Fonts — SIL Open Font License 1.1

| Font | Author | Use | License file |
|---|---|---|---|
| Lilita One | Juan Montoreano | chunky display lettering, buttons, numbers | `game/assets/licenses/OFL-LilitaOne.txt` |
| Rubik (variable) | Hubert & Fischer, Meir Sadan, Cyreal | small UI text | `game/assets/licenses/OFL-Rubik.txt` |
| Cinzel (variable) | Natanael Gama | Roman capitals: circle numerals, banners | `game/assets/licenses/OFL-Cinzel.txt` |

The fonts are bundled locally as WOFF2 (Latin subset, from Google Fonts); no CDN is used at runtime.

## Theme

Dante Alighieri's *Inferno* (1320) is in the public domain. The circle names and taglines are original paraphrases.

## Design folder

`design/mockups/fonts/` holds OFL-licensed Google Fonts (Baloo 2, Chakra Petch, Fredoka, Lilita One, Rubik), used only by the art-direction mockups.
