# Legend Paddock Club — Brand Film Production Bible

**Format:** 90 s · 16:9 · 24 fps · master at 3840×2160 (UHD), proxy at 1920×1080
**Tone:** Rolls-Royce / Porsche / Bugatti / Apple product film. Quiet confidence, no hard sell.
**The rule of the film:** every scene opens on a microscopic detail and ends on an epic wide. Smallest to biggest, again and again.
**Hard constraints:** no website, no screen UI, no app interface, no URL anywhere in frame. The diagnostic tablet in Scene 3 is shown edge-on or from behind. All gauges are analogue.
**Trademarks:** no third-party marques, badges or logos (no prancing horse, no shield crests). Every badge, wheel cap and engraving uses the **LPC emblem** defined in this document.

This repository contains two things that share this bible:

1. **A procedural CGI cut of the film.** It is real-time Three.js and renders to MP4 with `npm run render`. It locks timing, camera language, match cuts, typography and sound. Use it as the animatic and pre-vis.
2. **A shot-by-shot brief and prompt pack.** Use it to take each shot to photoreal, either with a CGI studio (Unreal / Houdini / V-Ray) or with AI video models (Veo, Sora, Kling, Runway). The pre-vis timecodes are the edit decision list.

---

## 1. Visual identity

| Token | Value | Use |
|---|---|---|
| Deep black | `#050505` | Hero car paint base, voids, title background |
| Champagne gold | `#D9B26A` / highlight `#F4E2B8` | Outlines, light lines, typography, emblem, accents |
| Brushed titanium | `#9A9B9F` | Machined parts, membership card, fasteners |
| Deep burgundy | `#3D0B12` | Cam covers, calipers, velvet, second hero car |
| Warm key | 3200–3600 K | Studio and interior practicals |
| Golden hour | sun 8° elevation, `#FFC27A` | Exteriors: coast, circuit |
| Dusk | sky `#0A1430` → horizon `#D8743E` | Paddock building, carrier |

**Grade:** ACES filmic. Neutral, dense blacks. Champagne highlights. Restrained saturation. Fine 35 mm grain (≈3.5 %), soft vignette, light halation around speculars, and horizontal anamorphic streaks on bright points (gold tint, never blue except at the spark).

**Lens language:** probe/macro lenses for details at T2–T2.8 with a razor-thin focal plane. Slow dollies. Orbital moves. FPV drone flights. Vertical crane reveals. Key moments are shot at 120 fps and played at 24 fps (5× slow motion).

**Materials checklist (photoreal pass):** multi-layer car paint with metallic flake (visible in macro) and an orange-peel clearcoat. Hand-stitched leather with visible thread tension. 2×2 twill carbon fibre. Polished and brushed chrome. Engraved metal. Micro-scratches. Oil sheen. Condensation. Dust motes in light beams.

### The LPC emblem
A circular badge. An outer ring reads `LEGEND · PADDOCK · CLUB ·` in a Garamond-style serif. Inside sits a single-line car profile drawn in one gold stroke, and below it the monogram **LPC**. It is engraved, not printed: it reads through light, not ink. It appears on the wheel spinners, the nose badge, the steering hub, the vault wheel hub, the key, the membership card, the carrier, the wax seal and the final macro.

### The hero car
A one-off 1960s berlinetta in the spirit of the great Italian and British GTs. It has a long bonnet, an oval egg-crate grille in a chrome surround, covered headlamps, a fastback greenhouse, Kamm tail with twin round lamps, 60-spoke chrome wire wheels with gold two-eared knock-off spinners, burgundy calipers, a front-mounted V8 with burgundy crinkle cam covers and eight chrome velocity stacks, a wood-rim steering wheel and a chrome open-gate shifter. Paint: deep black. It appears in profile at the start (hangar) and the end (logo).

**The collection** (Scenes 4–8) adds a 1970s grand tourer, a modern mid-engine supercar, a long-tail endurance prototype and a 1950s roadster in the palette colours.

---

## 2. Edit decision list and shot list

Timecodes are in seconds. **Trans.** is the transition *into* the shot, as implemented in `src/engine/pipeline.js`:

| Transition | Effect |
|---|---|
| `flash` | Light burst |
| `zoom` | Push through the frame centre |
| `whip` | Directional motion blur |
| `luma` | The next shot's highlights emerge first |
| `iris` | Circular reveal |
| `burn` | Gold-edged particle dissolve |
| `black` | Dip through black |

### Scene 1 — The Spark (0–8)
| Shot | In–Out | Trans. | Description | Camera |
|---|---|---|---|---|
| 1.1 | 0.00–2.55 | — | Extreme macro on a spark plug: white ceramic nose, nickel centre electrode, bent ground strap, 1 mm gap. Pre-flicker at 0.55, then the arc ignites at 0.70 in slow motion (blue-white plasma). A flame kernel blooms from blue to gold and fills the chamber. | Probe lens, slow push from 4 cm to 1.7 cm, T2 |
| 1.2 | 2.55–4.65 | flash | The flame front drives the piston down the honed bore. The camera dives with it, slips past the crown into the crankcase and finds the mirror-polished con-rod swinging on the crank throw, rim-lit gold. | FPV probe, roll 30° |
| 1.3 | 4.65–5.75 | zoom | Through a polished intake runner past the butterfly toward a blinding mouth of light. | Accelerating dolly |
| 1.4 | 5.75–8.00 | flash | *Burst out:* tight on the covered headlamp and fender. Pull back in an arc to a museum-lit profile, then crane up and back to a wide aerial. The car sits alone in a ring of floor light inside a monumental barrel-vault hangar. Dust drifts in a single top light. | Arc dolly → crane, 32→42° fov |

### Scene 2 — The Anatomy (8–18)
| Shot | In–Out | Trans. | Description | Camera |
|---|---|---|---|---|
| 2.1 | 8.0–12.3 | dissolve | The hangar dissolves into black space. The car holds its screen position. In a front-to-back wave it separates into a floating exploded view. Body panels part along real shut-lines. Then the engine, transmission, suspension, discs, calipers, seats and steering wheel, plus ≈1,900 fasteners, all turning gently, traced in thin gold light lines. | Descending orbit |
| 2.2 | 12.3–13.3 | zoom | Macro: a bolt thread turning on its axis. A titanium washer drifts through focus (rack focus). | Probe, T2 |
| 2.3 | 13.3–13.8 | whip | Macro glide along a twisted wiring harness with gold connectors. | Probe glide |
| 2.3b | 13.8–14.25 | whip | Macro: the gold baseball stitch on the leather steering-wheel rim. | Probe glide |
| 2.4 | 14.25–18.0 | zoom | Every part re-assembles in one perfect rear-to-front wave. Pull back and rise to a vertical top-down of the car on a black mirror floor. | Crane to 90° top-down |

### Scene 3 — The Atelier (18–30) · *expertise / entretien*
| Shot | In–Out | Trans. | Description |
|---|---|---|---|
| 3.1 | 18.0–19.1 | zoom | Gloved fingertip tracing the door-to-fender panel gap. |
| 3.2 | 19.1–20.0 | whip | Click-type torque wrench on a hub nut. It reaches value: click, a tiny recoil. |
| 3.3 | 20.0–20.9 | whip | Micro-polisher passing over black paint. Swirl marks vanish behind the pad in a grazing highlight. |
| 3.4 | 20.9–21.7 | luma | An analogue paint-depth gauge (µm). The probe touches the paint and the needle settles at ≈118 µm (rack focus probe → dial). |
| 3.5 | 21.7–23.0 | whip | Needle-fine sable striping brush laying a gold coachline along the flank. |
| 3.6 | 23.0–30.0 | cut | Pull out from the coachline to reveal the whole team working around ONE car in a spotless workshop. A technician kneels at the front wheel. An engine specialist leans into the open V8. Two upholsterers stitch a seat at the walnut bench. A bodywork expert crouches with a polisher. A technician holds a tablet, screen away from camera. The leader directs with quiet gestures. Everyone moves on the same 2-second bar, like a ballet. Slow orbit, then a high crane over the tool walls, every tool graduated and in perfect order. |

### Scene 4 — The Collection (30–40) · *voitures d'exception*
| Shot | In–Out | Trans. | Description |
|---|---|---|---|
| 4.1 | 30.0–31.0 | luma | An amber droplet of oil slides down the cast fins of an engine block, leaving a wet trail. |
| 4.2 | 31.0–31.9 | whip | Vintage speedometer: the needle sweeps to 248 km/h (red zone from 260). |
| 4.3 | 31.9–32.8 | iris | The embossed LPC emblem on a wire-wheel cap, turning. A light sweep crosses the relief. |
| 4.4 | 32.8–33.6 | whip | Grain of a cognac leather seat with a gold top-stitch seam, grazing light. |
| 4.5 | 33.6–40.0 | zoom | FPV drone threads low between twelve iconic cars on a black mirror floor. Each sits in its own pool of light, ringed in gold. Then it rockets straight up: from above the collection forms a perfect **clock dial** around a floor medallion. |

### Scene 5 — The Paddock (40–50) · *lieu / stockage / sécurité*
| Shot | In–Out | Trans. | Description |
|---|---|---|---|
| 5.1 | 40.0–41.2 | iris | *Match cut: the clock-dial collection becomes a vault wheel.* The vault lock turns, gears mesh and eight chrome bolts retract. |
| 5.2 | 41.2–42.1 | whip | An analogue hygrometer settles at 50 % RH beside a thermometer at 18 °C. |
| 5.3 | 42.1–44.0 | luma | A satin car cover is lifted in slow motion and peels front to back, revealing burgundy paint reflections. |
| 5.4 | 44.0–46.6 | dissolve | The private paddock: climate-controlled bays behind glass, each car on its own gold-edged illuminated platform, a discreet ceiling dome, a concierge at the far desk. |
| 5.5 | 46.6–50.0 | dissolve | Outside at dusk, a crane rises over the long glass pavilion. Its windows glow, mirrored in a reflecting pool. **TITLE: "Where legends park."** |

### Scene 6 — The Road (50–62) · *rallyes, sorties, circuits*
| Shot | In–Out | Trans. | Description |
|---|---|---|---|
| 6.1 | 50.0–50.9 | luma | Tyre tread rolling onto wet asphalt, water droplets beading. |
| 6.2 | 50.9–51.7 | flash | Brake disc glowing orange through the spokes. |
| 6.3 | 51.7–52.5 | whip | Chrome open-gate shifter clacks into gear. |
| 6.4 | 52.5–53.4 | whip | Gold-mirrored helmet visor. The winding coast road and the sun slide across it. |
| 6.5 | 53.4–56.6 | luma | Convoy of five cars on a Mediterranean coast road at golden hour, backlit, rising to reveal the bay. |
| 6.6 | 56.6–59.4 | zoom | Vertigo aerial: top-down, rotating and zooming as the convoy snakes through mountain switchbacks. |
| 6.7 | 59.4–62.0 | whip | Closed circuit at sunset, slow-motion pass at kerb height. Sparks from the skid plate. |

### Scene 7 — The Club (62–72) · *communauté et membres*
| Shot | In–Out | Trans. | Description |
|---|---|---|---|
| 7.1 | 62.0–63.0 | luma | Two crystal coupes clink. A glint. Fire-lit bokeh behind. |
| 7.2 | 63.0–64.0 | whip | A brushed-titanium membership card, engraved **Nº 007**, slides over dark walnut. |
| 7.3 | 64.0–65.0 | whip | A gold watch on a wrist, hand at the walnut gear knob. |
| 7.4 | 65.0–66.0 | whip | A handshake beside a car door. |
| 7.5 | 66.0–72.0 | dissolve | The members' lounge: fireplace, leather armchairs, members in conversation, discreet staff with a tray. Giant windows open onto the lit paddock with cars on their platforms. |

### Scene 8 — The Service (72–82) · *conciergerie, événements, achat / vente*
| Shot | In–Out | Trans. | Description |
|---|---|---|---|
| 8.1 | 72.0–73.8 | luma | A key placed on a burgundy velvet tray with a gold rim. Pull back to the concierge desk. |
| 8.2 | 73.8–75.8 | zoom | Enclosed black carrier at dusk, gold coachline: the rear doors close on a perfect seal. |
| 8.3 | 75.8–77.8 | luma | Private track day being set up at sunset: chequered flag, cones, five cars in echelon. **TITLE: "Collect. Care. Drive. Belong."** (75.9–81.2, word by word) |
| 8.4 | 77.8–79.8 | dissolve | A rare prototype turning on a gold-ringed platform under three spotlights, before a silent seated audience. |
| 8.5 | 79.8–82.0 | luma | A certificate of authenticity. A brass stamp presses molten gold wax, then lifts to reveal the embossed emblem. |

### Scene 9 — The Legacy (82–90)
| Shot | In–Out | Trans. | Description |
|---|---|---|---|
| 9.1 | 82.0–86.6 | burn | Gold line-drawings of the film's elements (spark plug, gear, crystal, tyre, key, seal) dissolve into thousands of gold particles. They swirl around the black car in profile, then converge to draw the logo: the car's silhouette in one gold line with **Legend Paddock Club** set into its flank. **TITLE: "Legend Paddock Club"** resolves on the particles. |
| 9.2 | 86.6–90.0 | black | Final macro on the engraved emblem. One last reflection crosses the relief, then black. |

---

## 3. Match-cut map

Use these continuity devices when re-shooting or generating photoreal shots:

| Out-going | In-coming | Device |
|---|---|---|
| Flame fills the chamber (1.1) | Bore dive (1.2) | Light burst: the flame *is* the flash |
| Con-rod gleam (1.2) | Runner (1.3) | Push through the bright reflection |
| Runner mouth of light (1.3) | Headlamp in the hangar (1.4) | The light at the end of the tube becomes the lamp |
| Hangar aerial (1.4) | Exploded view (2.1) | Same car, same screen position; the world dissolves around it |
| Top-down mirror floor (2.4) | Fingertip on the panel gap (3.1) | Push into the shut-line in the centre of frame |
| Crane over workshop (3.6) | Oil droplet (4.1) | Luma: the droplet highlight emerges first |
| Wheel cap (4.3) | — | **A spinning wheel becomes a clock dial**: the 4.5 top-down collection *is* the dial |
| Clock-dial collection (4.5) | Vault wheel (5.1) | Iris on the radial pattern: **the dial becomes the vault mechanism (gear → roundabout read)** |
| Dusk building (5.5) | Wet tyre (6.1) | Window glow → water-droplet highlights |
| Visor reflection (6.4) | Convoy (6.5) | **A chrome reflection becomes the next scene** |
| Sparks (6.7) | Crystal glint (7.1) | Spark → glint |
| Wax seal (8.5) | Particle swirl (9.1) | Gold burn; **a dust particle becomes a star** in the swirl |

---

## 4. Typography

* Serif: Cormorant Garamond (SIL OFL, bundled in `assets/fonts`). Champagne gold gradient with a slow light sweep. Letter-spacing settles from wide to final. A soft blur resolves. A soft black halo guarantees "gold on black" over any picture.
* One line at a time, never more than four words:
  * 46.9–49.9 — **Where legends park.** (lower third, hairline rules)
  * 75.9–81.2 — **Collect. Care. Drive. Belong.** (word by word)
  * 84.7–86.95 — **Legend Paddock Club** (set into the logo, on the car's flank)

---

## 5. Sound cue sheet

**Score.** Key of D minor, on a 2-second bar. Piano carries the motif, strings pad underneath, brass and timpani arrive for the climax. A subtle V8 rumble sits in the bass throughout. The climax resolves to **D major** at 84.0. Picture-locked foley follows (generated in `audio/score.js`).

| Time | Cue |
|---|---|
| 0.52–1.40 | Spark crackle, arc buzz |
| 1.0 | Ignition thump, rising roar |
| 2.3 / 4.4 / 5.5 | Whooshes into the transitions |
| 5.6–8.4 | Idle V8 rumble as the car is revealed |
| 0.9–7.0 | Piano motif: D5 · A4 · F5 · E5 · D5 |
| 4.0 | Strings enter |
| 8.7–11.3 | Metallic ticks as parts separate |
| 12.4 | Ratchet on the bolt |
| 13.8 | Leather creak on the stitch |
| 14.3 | Reassembly whoosh |
| 16.0 | Seating clunk |
| 18.1 | Glove creak |
| 19.1–19.65 | Ratchet, then torque **click** |
| 20.0 | Polisher hum |
| 21.0 | Gauge tick |
| 21.7 | Brush whisper |
| 23–30 | Workshop ensemble on the bar. Ostinato and kick from 24. |
| 30.6 | Oil drop |
| 31.0 | Needle whir |
| 32.0 | Emblem chime |
| 33.5–40 | FPV whooshes and engine pass-bys. Rising swell to 40. |
| 40.0–41.1 | Vault gears and eight bolt clunks |
| 41.3 | Hygrometer tick |
| 42.2–44.6 | Silk cover |
| 46.6 | Brass swell and crash under **"Where legends park."** |
| 50.0 | Tyre hiss |
| 50.9 | Brake sizzle |
| 51.9 | Gearshift clack |
| 52.5 | Helmet wind |
| 53.3–59.5 | Convoy engines |
| 56.6 | Aerial wind |
| 59.3–62 | Circuit pass-by with doppler, sparks |
| 62.55 | Crystal chime |
| 63.0 | Card slide |
| 64.0 | Watch ticking |
| 65.3 | Handshake |
| 66–72 | Fire crackle |
| 72.84 | Key on velvet |
| 74.55 | Carrier door seal thud |
| 75.8 | Flag flutter |
| 77.8 | Platform hum |
| 80.32 | Wax seal press |
| 79.6–82 | Timpani roll, cymbal swell |
| 82.0–85.0 | Orchestral climax (Bb → C → D major), gold-particle shimmer |
| **85.0–88.35** | **Total silence** |
| **88.35–90.0** | **A single engine start:** starter crank, catch, one blip, settle to idle |

---

## 6. Photoreal prompt pack (AI video: Veo / Sora / Kling / Runway)

Generate shot by shot at 24 fps, 16:9, ≥ 1080p. Upscale to 4K. Conform in the edit to the EDL above.

1. **Prepend the global style block** to every prompt.
2. **Use the hero car block** wherever the hero appears.
3. **Lock the first frame** to the last frame of the previous shot (image-to-video) to carry the match cuts.

**Global style block**
> Ultra-premium photoreal CGI brand film, Rolls-Royce / Porsche / Apple product-film aesthetic. Palette of deep black, warm champagne gold, brushed titanium, touches of deep burgundy. Dark moody studio lighting with volumetric light beams, floating dust, shallow depth of field, anamorphic lens flares, subtle 35 mm film grain, ACES filmic grade. Slow, precise camera; no text, no logos except the engraved LPC emblem, no screens, no UI, no website.

**Hero car block**
> a unique 1960s black berlinetta grand-tourer with a long bonnet, oval egg-crate grille in a chrome surround, covered headlamps, fastback roof, Kamm tail with twin round tail-lamps, chrome 60-spoke wire wheels with gold two-eared knock-off spinners, burgundy brake calipers; deep black multi-layer paint with visible metallic flake and orange-peel clearcoat

| Shot | Prompt (append to the style block) |
|---|---|
| 1.1 | Extreme macro probe-lens shot inside an engine cylinder looking at a spark plug tip: white ceramic insulator, nickel centre electrode, bent ground strap, a 1 mm gap. A blue-white electric arc ignites in 120 fps slow motion, crackling, and a flame kernel blooms from blue to gold until it fills the frame. |
| 1.2 | First-person dive down a honed cylinder bore with cross-hatch texture as the flame front drives the piston down. The camera slips past the piston into a dark crankcase where a mirror-polished con-rod swings on the crankshaft, rim-lit in gold. |
| 1.3 | Camera flies through a mirror-polished intake runner, past a butterfly valve, accelerating toward a blinding circle of warm light. |
| 1.4 | [hero car] in perfect profile inside a monumental dark barrel-vaulted hangar, lit like a museum piece by a single top light with dust in the beam. The camera pulls back from the headlamp in a smooth arc, then cranes up to a vast aerial. The car is alone on a polished floor inside a thin ring of gold floor light. |
| 2.1 | The same car floats in black space and slowly separates into an exploded technical view, front to back: body panels part along their shut-lines, then engine, gearbox, suspension springs, brake discs and calipers, seats, steering wheel and thousands of bolts and washers, all rotating gently, each outlined in thin glowing champagne-gold lines. |
| 2.2 | Extreme macro of a polished steel bolt thread rotating on its axis. A brushed titanium washer drifts through the foreground; rack focus. Gold line-drawn car parts glow out of focus behind. |
| 2.3 | Macro glide along a twisted wiring harness of burgundy, gold and black wires with gold connectors, then a whip to the gold baseball stitching on a black leather steering-wheel rim. |
| 2.4 | All the floating parts re-assemble in one perfect wave into the complete car. The camera pulls back and rises to a vertical top-down shot of the car on a black mirror floor. |
| 3.1–3.5 | Five 1-second macros in a spotless workshop: (1) a black-gloved fingertip tracing a panel gap on black paint; (2) a click-type torque wrench clicking to value on a wheel nut; (3) a micro-polisher erasing a swirl mark in a grazing highlight; (4) an analogue paint-thickness gauge whose needle settles as the probe touches the paint; (5) a needle-fine sable brush hand-painting a gold pinstripe along the flank. |
| 3.6 | Pull back to reveal master craftsmen in dark uniforms working around ONE black classic car in an immaculate charcoal workshop with a light epoxy floor and LED panel ceiling. A mechanic kneels at the wheel, an engine specialist leans into the open V8, two upholsterers stitch a cognac seat at a walnut bench, a bodywork expert guides a polisher, a technician holds a tablet with the screen away from camera, and a leader in a dark suit coordinates with quiet gestures. Synchronised, ballet-like movement. Slow orbit, then a high crane over walls of perfectly ordered tools. |
| 4.1–4.4 | Macros: an amber oil droplet sliding down cast-aluminium engine fins; a vintage speedometer needle sweeping; an embossed LPC emblem on a wire-wheel cap with a light sweep; the grain of a cognac leather seat with gold top-stitching. |
| 4.5 | FPV drone flies low and fast between iconic cars (1960s classic, 1970s GT, modern supercar, endurance prototype, 1950s roadster) on a black mirror floor under soft spotlights, each car ringed in a thin gold light, then rockets straight up to reveal twelve cars arranged in a perfect radial pattern like a clock dial around a gold floor medallion. |
| 5.1–5.3 | Macros: a vault door wheel turning with meshing gears as chrome locking bolts retract; an analogue hygrometer needle settling at 50 %; a satin car cover lifted in slow motion, peeling away to reveal burgundy paint reflections. |
| 5.4 | Wide cinematic shot of a luxurious private paddock: climate-controlled glass bays, warm gold ambient light, each classic car on its own illuminated platform with a gold edge, a discreet security dome, a concierge at a walnut desk in the distance. |
| 5.5 | Vertical crane shot rising over a long modern glass pavilion at dusk. Its windows glow warm gold and are mirrored in a reflecting pool. A black classic car waits at the entrance under a deep blue-to-orange sky. |
| 6.1–6.4 | Macros at golden hour: tyre tread rolling onto wet asphalt with beading droplets; a brake disc glowing orange through chrome wire spokes; a chrome open-gate gearshift engaging; a gold-mirrored helmet visor reflecting a winding coastal road and the low sun. |
| 6.5 | A convoy of five classic and modern sports cars on a winding Mediterranean coastal road at golden hour, backlit by the low sun, the sea glittering below, umbrella pines and cypresses. Tracking shot that rises. |
| 6.6 | Vertigo aerial top-down shot, rotating and zooming, of the convoy snaking through mountain switchbacks above the sea at golden hour. |
| 6.7 | Low kerb-height slow-motion pass of a black supercar on a closed circuit at sunset, sparks streaming from the skid plate, red and white kerbs. |
| 7.1–7.4 | Macros in a warm members' lounge: two crystal coupes of champagne clinking with a glint and fire-lit bokeh; a brushed-titanium membership card engraved "Nº 007" sliding over dark walnut; a gold dress watch on a wrist as the hand rests on a walnut gear knob; a firm handshake beside a black car door. |
| 7.5 | Warm wide shot of a private club lounge: a fireplace, cognac leather armchairs, members talking with glasses in hand, discreet staff with a gold tray, walnut panelling, giant windows onto a lit garage of classic cars on illuminated platforms. Atmosphere of belonging and discretion. |
| 8.1–8.5 | One continuous flowing camera path, every shot macro-to-wide: a car key placed on a burgundy velvet tray with a gold rim, revealing a concierge desk; the rear doors of an enclosed black car carrier closing on a perfect seal at dusk; a chequered flag fluttering as a private track day is set up at sunset with cars in echelon; a rare gold prototype turning on a platform under three spotlights before a silent seated audience; a brass stamp pressing a gold wax seal onto a certificate of authenticity. |
| 9.1 | In black space, gold line-drawings of a spark plug, gear, crystal glass, tyre, key and wax seal dissolve into thousands of gold particles that swirl around a black classic car in profile, then converge to draw a single gold line tracing the car's silhouette, with the words "Legend Paddock Club" written in an elegant serif along its flank. |
| 9.2 | Final extreme macro of an engraved gold emblem (circular, LPC monogram, single-line car profile). One last reflection travels across the engraving, then fade to black. |

---

## 7. CGI studio notes (photoreal pipeline)

* **Assets to build:**
  * Hero car with a full exploded hierarchy: panels, engine sub-assemblies, suspension, braking, interior, ≈2,000 fasteners.
  * Four collection cars.
  * Spark plug, cylinder, piston and con-rod at macro scale.
  * Props: torque wrench, polisher, gauges, watch, card, key, tray, carrier, wax seal and stamp.
  * Environments: hangar, workshop, gallery, paddock interior and exterior, coast, circuit, lounge.
  * Digital humans for the team and members, or live-action plates comped in.
* **Simulation:**
  * Spark arc and combustion: pyro.
  * Car cover: cloth.
  * Oil droplet and wet asphalt: FLIP / particles.
  * Wax pressing: viscous fluid.
  * Gold particles: POP swirl with a logo-attract field. Use the logo silhouette and lettering from `src/scenes/s9-legacy.js`.
* **Lighting references:** `src/engine/materials.js` (studio, museum, workshop, lounge, golden-hour and dusk rigs) and each scene file's spot positions.
* **Cameras:** every move in the pre-vis is a keyframed curve in its scene file. Export them, or match the composition from the pre-vis MP4.
* **Delivery:**
  * UHD 3840×2160 at 23.976 / 24 fps, ProRes 4444 XQ master plus H.264 web master.
  * Stereo 48 kHz 24-bit mix at −14 LUFS integrated for web, plus stems (score, foley, engine).
  * Textless version for localisation.
