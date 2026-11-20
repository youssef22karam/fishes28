// Flow QA: every lab action on de-novo specimens (migrate · offspring · cross · census · blind · presets), built with the real engine.
//   npx esbuild tools/flowqa.ts --bundle --platform=node --format=cjs --external:@napi-rs/canvas --outfile=/tmp/rt/flowqa.cjs && node /tmp/rt/flowqa.cjs
import { createCanvas } from '@napi-rs/canvas';
import * as THREE from 'three';
import { buildFish } from '../src/engine/build';
import { SPECIES } from '../src/data/species';
import { blind, census, cross, fromSpecies, generate, migrate, offspring, type GenFish } from '../src/gen/generate';
import { HABITATS } from '../src/gen/habitats';
import { PLAN_NAMES, type Plan } from '../src/gen/genesis';
(globalThis as any).document = { createElement: () => createCanvas(4, 4) };
let bad = 0, n = 0;
const check = (label: string, f: () => GenFish, build = true) => {
  n++;
  try {
    const g = f();
    if (!g.common || !g.latin || !g.notes.length || g.notes.some((x) => !x || !x.title)) throw new Error('incomplete record');
    if (build) {
      const fb = buildFish(g.species, 1);
      let nan = 0;
      for (const m of fb.group.children as THREE.Mesh[]) { const P = m.geometry.getAttribute('position'); for (let i = 0; i < P.array.length; i++) if (!Number.isFinite(P.array[i])) nan++; }
      fb.dispose();
      if (nan) throw new Error(`NaN verts ${nan}`);
    }
    return g;
  } catch (e) { bad++; console.log('FAIL', label, (e as Error).message.slice(0, 120)); return null; }
};
const plans = Object.keys(PLAN_NAMES) as Plan[];
// every construction forced into an unusual habitat
plans.forEach((p, i) => check(`plan ${p}`, () => generate(HABITATS[(i * 5) % HABITATS.length].id, 900 + i, { novelty: 0.9, plan: p })));
// lab actions
const a = check('novo a', () => generate('reef', 3, { novelty: 0.7 }), false)!;
const b = check('novo b', () => generate('reef', 7, { novelty: 0.7 }), false)!;
const c = check('novo c', () => generate('abyss', 4, { novelty: 0.7 }), false)!;
check('offspring', () => offspring(a, 11));
check('offspring of offspring', () => offspring(offspring(c, 5), 6));
check('migrate reef→abyss', () => migrate(a, 'abyss', 12, 0.7));
check('migrate abyss→stream', () => migrate(c, 'stream', 13, 0.7));
check('cross novo×novo', () => cross(a, b, 14));
check('cross novo×other plan', () => cross(a, c, 15));
check('cross novo×atlas', () => cross(a, fromSpecies(SPECIES[10]), 16));
check('cross atlas×novo', () => cross(fromSpecies(SPECIES[20]), b, 17));
for (let i = 0; i < 12; i++) check(`blind ${i}`, () => blind(i), i < 4);
for (const H of HABITATS) { n++; try { const cs = census(H.id, 77, 9, 0.65); if (cs.length < 6) throw new Error(`census ${cs.length}`); const ps = new Set(cs.map((x) => x.plan)); if (ps.size < 3) throw new Error(`census has only ${ps.size} constructions`); } catch (e) { bad++; console.log('FAIL census', H.id, (e as Error).message); } }
check('real species', () => generate('reef', 5, { novelty: 0 }), false);
console.log(`flows ${n} · failed ${bad}`);
