# IchthyoGenesis · De-novo Procedural Fish Lab

Based on [youssef22karam/fishes25](https://github.com/youssef22karam/fishes25). The 106-species measured atlas, 17 environments, migration, offspring and cross-breeding are retained. **The generator is new**: it no longer mutates and recolours atlas species.

## Run

- `npm install`
- `npm run dev` · `npm run build`

## De-novo generation (`src/gen/genesis.ts`)

Every click on **Generate specimen** grows a fish from first principles — no atlas parent:

1. **Ecology** – the habitat picks a diet and one of 13 body constructions (spindle, disc, arrow, eel, ribbon, bottom-hugger, globe/box, great-jaw, keel-belly, tadpole, shark-form, winged ray, side-lying flatfish). Each habitat has its own weighting, which is its identity: knifefish ribbons and sail-finned discs in blackwater, rays and flatfishes on sand, lure-jawed and whip-tailed forms in the abyss, keeled silver cruisers offshore.
2. **Outline synthesis** – the dorsal and ventral silhouette are drawn from ~16 continuous shape genes (apex positions, forehead law, nuchal hump, forceps snout, belly keel, taper law, peduncle), then measured back like an atlas outline.
3. **Organs by rule** – jaws from diet; eye size from light × body-size allometry; 10 dorsal-fin architectures × anal layouts × 12 tail types chosen from cruising speed; paired fins from gait; skin from lifestyle.
4. **Habitat signatures** – finlets, keels and bills offshore; lures in the dark; barbels in mud; periscope eyes on mudflats; fronds in kelp; adipose fins in rivers; veils and feeler pelvics in still water.
5. **Livery** – the existing pigment engine paints the result with the habitat's colour ecology.

Every decision is written to the Field Guide as a note. The **Novelty** slider: `0` = real atlas species, above that everything is de-novo (higher = rarer constructions and more extreme display organs). **Body construction** forces any of the 13 plans in any habitat. Consecutive clicks avoid repeating the construction just shown; a seed alone still reproduces a specimen (`?hab=reef&seed=…&nov=…`).

## Anatomy fixes

- **Whale shark** – the eye sits behind and above the corner of the mouth. The body model now also keeps any orbit off the oral cleft (atlas and generated heads alike).
- **Longhorn cowfish** – horns are lofted out of the carapace above each eye with a flared root and gentle curve (`Spike.horn`), steeper face profile, eye under the horn base.
- **Mudskipper** – close-set periscope eyes on raised pedestals on the skull roof (`EyeSpec.close`, `EyeSpec.stalk`); generated mudflat fishes can inherit the same construction.

## Verification

- `npx tsc --noEmit`
- `tools/genstats.ts` – generator sweep (failures, retries, diversity per habitat).
- `tools/view.ts` – software-rasterises the real engine meshes from any angle (`atlas`, `gen`, `genhead`, `plans`, `audit` modes); see the header of each file for the esbuild command.

`src/engine/model.ts`, `shader.ts`, `skin.ts` and `src/gen/pigment.ts` are also stored as parts (upstream upload limit). After editing them run `node tools/split.mjs`; `node tools/reassemble.mjs` rebuilds them from the parts.

## v21 · Discovery engine, full fin/tail catalogue, render fixes

**Every click is a discovery** (`src/gen/discover.ts`). One roll decides what the net brings up: a **living species** from the 106-species atlas (natives first; one in four is a wanderer from anywhere on Earth: seahorses, sunfish, hammerheads, coelacanths…), a **natural hybrid** of the real lineages of that water, or a **de-novo species**. Each find gets a rarity tier (Common → Mythic, or Living species) that drives the materialisation colour, the chime and the badge. The **Codex** counts the living species you have found (stored locally). Shared URLs (`&d=1`) reproduce the find exactly.

**Magic** – the specimen is woven out of light: a swarm of tier-coloured motes converges onto the real mesh vertices while a noisy, glowing dissolve front materialises the skin from the centre outward (`FRAG_REVEAL` in `shader.ts`, wall-clock timed). Then a radial flash and rings, a shimmering rarity badge, the title revealed glyph by glyph, and a synthesized WebAudio arpeggio whose brightness follows the rarity (♪ toggle).

**Morphology catalogue** (`src/gen/flourish.ts`, engine support in `fins.ts`):
- 11 new caudal types – swallowtail, sword tail, hypocercal (flying fishes), spade, double tail, crowntail, whip filament, clavus (ocean-sunfish pseudo-tail with tall opposed dorsal/anal blades), veiltail, double-emarginate, trilobed (coelacanth) – 23 in total.
- 8 new fin outlines – wing, crest, scythe, notch, saddle, plume, streamer, comb of separate spines – 27 in total.
- Gliding wing pectorals, walking "hands", lionfish fans, gourami feeler pelvics, nuchal humps, hammerhead cephalofoils, sawshark rostra, needlefish bills.

**Render fixes**
- *Head shards and cornea bubbles*: oversized generated eyes made the two orbital collars cross the forehead midline. `fitEye` (`build.ts`) limits generated, hybrid and offspring globes to the local skull half-width and depth and keeps them behind the snout tip; the measured atlas proportions are left untouched.
- *Plank-like jaws*: `jawAngle` keeps the lower-jaw tip's drop within the head depth, so great-jawed hunters open a mouth instead of hanging a slab.
- *Stretched patterns*: the albedo sheet now takes the proportions of the fish (square texels on the body: up to 4096 px along eels and billfishes, square sheets on globe and disc fishes). The shader's procedural skin detail (mottling, melanophores, warp) uses the local girth at every station (`sGirthA`) instead of one mean value, so detail stays isotropic on bulbous heads, thin peduncles and long snouts.

## v22 · Dermal outgrowths: skin tags grown from the living skin

Cirri, leafy flaps, filaments, papillae, tubercles and prickles are grown from the integument itself. They are not objects glued onto the fish (`src/engine/dermis.ts`).

| kind | real examples | shape |
|---|---|---|
| `cirrus` | scorpionfishes, frogfishes, seahorses, blennies | tapering skin tentacle that branches like an antler (recursive tines) |
| `flap` | stonefishes, sargassum fish, wobbegongs, lionfish brows | leaf blade lying back over the skin, with a scalloped, ragged margin |
| `filament` | anglerfish sensory filaments, lionfish | single fine, limp thread |
| `wart` | stonefishes, frogfishes, toadfishes | low, lumpy papilla dome |
| `tubercle` | seahorse ring ridges and coronet, lumpfishes | blunt bony knob, often in regular rows |
| `prickle` | pufferfishes, porcupinefishes | sharp spinule with an elongated base, lying back toward the tail |

**How they blend with the body**
1. **Placement**: blue-noise sampling on the real 3D skin, area-weighted and optionally clumped into patches. Anatomical sites (`brow`, `jaw` fringe, `head`, `nape`, `ridge`, `flank`, `belly`, `tail`, `lateral`) are resolved against the actual eye, mouth seam and opercle. Outgrowths keep clear of the eyes, the mouth seam, the free margin of the gill cover, the fin bases and each other.
2. **Root on the true skin**: each root ring is solved in the body's own (s, φ) parameter space via the surface Jacobian. Every root vertex therefore lies exactly on the analytic skin and carries the body's UV, normal and jaw / plasticity / gill pose. Outgrowths open with the mouth and ride the breathing gill cover.
3. **Concave fillet**: an exponential flare skirts from the root into the shaft. Root normals are welded to the body normals, so there is no seam or hard edge.
4. **Pigment continuity**: the outgrowth keeps the UV of its root, so it wears the skin's own pattern. Vertex colours relative to the painted texel under the root add translucent tips, ring bands, mottling and a soft occlusion crease at the junction.
5. **Motion**: soft outgrowths drift and stream back in the water (vertex shader, `aFin.w = 0.3`). The weight is zero across the fillet, so the junction never opens; the Fin-motion toggle freezes them.
6. **Adaptive resolution**: broad papillae and knobs get round silhouettes, while small ones stay cheap.

**Atlas**: lined seahorse (ring tubercles, knobbed coronet, branched cirri), reef stonefish (papillae, ragged flaps, fringed lips, brow cirri), warty frogfish, porcupinefish (spines grown as prickles), red lionfish (banded brow tentacles, jaw lappets), tompot blenny (branched brow tentacles), both seadragons and the humpback anglerfish. The legacy `spines` and `cirri` switches are now grown by the same system.

**Generator** (`src/gen/dermis.ts`): eight ecological kits, each gated by body plan, diet and habitat: rock mimicry, weed mimicry, brow tentacles, puffer prickles, ring armour, lumpfish knobs, abyssal filaments and the dermal lobes of carpet sharks. Every kit is parameterised continuously and writes a field-guide note. About a quarter of de-novo specimens grow outgrowths, and those finds roll a higher rarity.

QA: `tools/dermis-qa.ts` reports placement per field, vertex count and build time.
