import { buildFish } from '../src/engine/build';
import { DERMIS_STATS } from '../src/engine/dermis';
import { SPECIES } from '../src/data/species';
import { createCanvas } from '@napi-rs/canvas';
(globalThis as any).document = { createElement: () => createCanvas(4, 4) };
// Dermal outgrowth QA: placement per field, vertex count and build time for every tagged atlas species.
//   npx esbuild tools/dermis-qa.ts --bundle --platform=node --format=cjs --external:@napi-rs/canvas --outfile=/tmp/dq.cjs && node /tmp/dq.cjs [ids…]
const ids = process.argv.slice(2);
for (const sp of SPECIES.filter((s) => ids.length ? ids.includes(s.id) : (s.tags || s.spines || s.cirri))) {
  const t0 = Date.now(); const fb = buildFish(sp, 1); const ms = Date.now() - t0;
  const m = fb.group.children.find((c) => c.name === 'dermis') as any;
  console.log(sp.id.padEnd(22), String(ms).padStart(5) + 'ms', 'verts', m ? m.geometry.getAttribute('position').count : 0, DERMIS_STATS.map((d) => d.kind + '@' + d.site + ' ' + d.placed + '/' + d.want).join(' | '));
  fb.dispose();
}
