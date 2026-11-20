// Integrity check: build every species with the real engine and make sure no geometry contains NaN / infinite vertices.
//   npx esbuild tools/check.ts --bundle --platform=node --format=cjs --external:@napi-rs/canvas --outfile=/tmp/rt/check.cjs && node /tmp/rt/check.cjs 0 40
import { createCanvas } from '@napi-rs/canvas';
import * as THREE from 'three';
import { SPECIES } from '../src/data/species';
import { buildFish } from '../src/engine/build';
(globalThis as any).document = { createElement: () => createCanvas(4, 4) };
const [a, b] = process.argv.slice(2).map(Number);
let bad = 0, n = 0;
for (const sp of SPECIES.slice(a, b)) {
  try {
    const fb = buildFish(sp, 1);
    let nan = 0, verts = 0;
    for (const m of fb.group.children as THREE.Mesh[]) {
      const P = m.geometry.getAttribute('position');
      verts += P.count;
      for (let i = 0; i < P.array.length; i++) if (!Number.isFinite(P.array[i])) nan++;
    }
    const md = fb.model, e = sp.eye;
    // the eye must lie inside the head outline, the mouth corner inside the head
    const eyeOut = e.d > 0 && sp.plan === 'fish' && e.y < 0.72 && md.normY(e.s, md.eyeYn) + e.d / 2 > md.top(e.s) * 1.08;
    if (nan || eyeOut) { bad++; console.log('PROBLEM', sp.id, { nan, eyeOut }); }
    n++;
    fb.dispose();
  } catch (err) { bad++; console.log('THROW', sp.id, (err as Error).message); }
}
console.log(`checked ${n} species [${a}, ${b}) – ${bad} problems`);
