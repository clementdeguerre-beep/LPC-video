# Legend Paddock Club — Brand Film

A 90-second, 16:9, 24 fps cinematic brand film for **Legend Paddock Club**. Every frame is made in code: procedural CGI in Three.js, a custom HDR camera pipeline, and a score with foley synthesised in the Web Audio API. There are no stock images, no models from the web and no recorded sounds.

* **Watch it live:** `npm install && npm run preview`, then open <http://localhost:5173>.
* **Render it to MP4:** `npm run render` (1080p) or `npm run render:4k` (UHD).
* **Take it to photoreal:** see [`docs/PRODUCTION_BIBLE.md`](docs/PRODUCTION_BIBLE.md). It has the shot list and EDL, the match-cut map, a prompt pack for AI video models, CGI-studio notes and the sound cue sheet.

## The film

| | Scene | Pillar | Macro → Wide |
|---|---|---|---|
| 0–8 | **The Spark** | | Spark-plug arc → bore dive → hangar aerial |
| 8–18 | **The Anatomy** | | Exploded view in gold lines, bolt thread, harness, stitched seam → top-down on a mirror floor |
| 18–30 | **The Atelier** | expertise / entretien | Panel gap, torque click, polish, paint gauge, pinstripe → the team in sync, crane over the tool walls |
| 30–40 | **The Collection** | voitures d'exception | Oil droplet, speedometer, emblem, leather → FPV through twelve cars, rising to a clock-dial pattern |
| 40–50 | **The Paddock** | lieu / stockage / sécurité | Vault lock, hygrometer, cover lift → the bays → dusk crane. *"Where legends park."* |
| 50–62 | **The Road** | rallyes, sorties, circuits | Wet tyre, glowing disc, gearshift, visor → coastal convoy, vertigo aerial, circuit sparks |
| 62–72 | **The Club** | communauté et membres | Crystal, membership card Nº 007, watch, handshake → the lounge |
| 72–82 | **The Service** | conciergerie, événements, achat / vente | Key on velvet, carrier seal, track day, rotating platform, gold wax seal. *"Collect. Care. Drive. Belong."* |
| 82–90 | **The Legacy** | | Gold particle swirl draws the logo → engraved emblem → silence → one engine start. *"Legend Paddock Club"* |

## How it works

```
index.html               player (fullscreen 16:9, scrubber, sound) and render entry (?render=1)
src/main.js              boot, live player, window.__film API used by the renderer
src/film.js              evaluates the shot list at time t: shots, transitions, grade, titles
src/timeline.js          the 90-second clock: scene order + on-screen text cues
src/engine/
  pipeline.js            MSAA HDR render → depth of field (golden-angle bokeh) → match-cut transitions
                         (flash, zoom, whip, luma, iris, burn, black) → bloom + anamorphic streaks →
                         ACES grade, halation, chromatic aberration, vignette, grain, titles
  materials.js           light-rig environment maps (studio, museum, workshop, lounge, golden hour, dusk)
                         and the material library (flake paint + clearcoat, chrome, titanium, leather…)
  textures.js            procedural textures: flake, orange peel, carbon twill, leather grain, tread,
                         asphalt, walnut, cross-hatch, the LPC emblem
  titles.js              Cormorant Garamond titles: tracking settle, blur-in, gold light sweep
src/models/
  car.js                 parametric lofted car: real panel gaps, greenhouse, lamps, wire/alloy wheels,
                         brakes, suspension, V8, interior, ~1,900 fasteners; explode + gold outlines
  engine.js              V8, spark plug, plasma arc, flame burst, piston/con-rod/crank, intake runner
  figure.js              couture-mannequin figures with poses, hand rig, watch
  props.js               gauges, torque wrench, hub, polisher, striping brush, tool wall, tool chest
  landscape.js           Mediterranean coast (terrain, carved road, sea, pines) and a race circuit
src/scenes/s1…s9         one file per scene; every shot is a function of time
audio/score.js           score + foley (OfflineAudioContext), silence at 85 s, engine start at 88.35 s
tools/render.mjs         deterministic offline renderer (frames → ffmpeg H.264 + AAC), resumable
tools/stills.mjs         grab stills at given times for review
```

Everything is a pure function of time, so renders are frame-exact and resumable. Re-running a render skips frames that already exist.

## Rendering

Requires Node 18+ and `ffmpeg`. Playwright drives Chromium. In a GPU-less container it uses SwiftShader: about 3–6 s per 1080p frame per worker on 4 CPU cores, so roughly 1.5 h for the whole 1080p film with `--workers 2` and around 6× that for native UHD. With a GPU (`--gpu`) it renders in minutes.

```bash
npm install
npm run render                                  # renders/LPC_film_1080p.mp4
npm run render:4k                               # renders/LPC_film_2160p.mp4 (UHD master)
node tools/render.mjs --width 1920 --height 1080 --workers 2   # parallel processes
node tools/render.mjs --from 40 --to 50         # a range (for review)
node tools/render.mjs --audio-only              # renders/score.wav
node tools/stills.mjs --t 12.5,47,85.5 --w 1280 # review stills
```

On a machine with a GPU, add `--gpu` to use the hardware renderer.

## Credits and licences

* Typeface: Cormorant Garamond, © The Cormorant Project Authors, SIL Open Font License 1.1 (`assets/fonts`).
* Three.js (MIT).
* All geometry, textures, music and sound are generated procedurally by this repository.
* No third-party trademarks are depicted. Every badge is the LPC emblem.
