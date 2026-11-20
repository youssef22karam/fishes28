// Unwraps the cranial anatomy map (src/engine/headmap.ts) of a few specimens into one PNG contact sheet:
// lit relief · cavity tone · integument class (dark = dermal bone, mid = naked skin, light = head scales, white = trunk).
// x runs snout → shoulder, y dorsal midline → ventral midline of one flank.
//   npx tsx tools/headmap-dump.ts .qa/headmap.png [species-id …]
import { createCanvas } from '@napi-rs/canvas';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
Object.assign(globalThis, { document: { createElement: () => createCanvas(8, 8) } });
if (typeof navigator === 'undefined') Object.assign(globalThis, { navigator: { userAgent: 'qa' } });
const { BodyModel } = await import('../src/engine/model');
const { paintHeadMap } = await import('../src/engine/headmap');
const { headAnatomy } = await import('../src/engine/head');
const { generate, fromSpecies, SPECIES_BY_ID } = await import('../src/gen/generate');
const [out = '.qa/headmap.png', ...ids] = process.argv.slice(2);
const list: [string, { species: any; seed: number }][] = ids.length
  ? ids.filter((id) => SPECIES_BY_ID[id]).map((id) => [id, fromSpecies(SPECIES_BY_ID[id])])
  : [
    ['tang', generate('reef', 422889723, { novelty: 0.65 })],
    ['wrasse', generate('reef', 704336341, { novelty: 0.13 })],
    ['trout', generate('lake', 165895884, { novelty: 0.58 })],
    ['carp', generate('stream', 870017040, { novelty: 0.73 })],
  ];
const S = 380;
const sheet = createCanvas(S * 3, S * list.length);
const ctx = sheet.getContext('2d');
ctx.fillStyle = '#04121b';
ctx.fillRect(0, 0, sheet.width, sheet.height);
list.forEach(([name, f], row) => {
  const model = new BodyModel(f.species, 2);
  const t0 = performance.now();
  const hm = paintHeadMap(model, f.seed);
  const ms = performance.now() - t0;
  const A = headAnatomy(model, f.seed);
  if (!hm || !A) { console.log(name, 'has no head map'); return; }
  const { data, width: W, height: H } = hm.tex.image as { data: Uint8Array; width: number; height: number };
  for (let panel = 0; panel < 3; panel++) {
    const im = ctx.createImageData(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const q = (Math.floor((y / S) * H) * W + Math.floor((x / S) * W)) * 4, o = (y * S + x) * 4;
      let v: number;
      if (panel === 0) {
        const gx = ((data[q] - 128) / 127) * 1.6, gy = ((data[q + 1] - 128) / 127) * 1.6;
        v = Math.min(255, Math.max(0, (255 * (0.5 * gx + 0.6 * gy + 0.62)) / Math.hypot(gx, gy, 1)));
      } else v = data[q + panel + 1];
      im.data[o] = im.data[o + 1] = im.data[o + 2] = v; im.data[o + 3] = 255;
    }
    ctx.putImageData(im, panel * S, row * S);
  }
  ctx.fillStyle = '#9ff0e6'; ctx.font = '14px sans-serif';
  ctx.fillText(`${name} · ${f.species.id} · ${A.traits.type} · scaly ${A.traits.scaly} · ${ms.toFixed(0)} ms`, 6, row * S + 16);
  console.log(name, f.species.id, f.species.group, JSON.stringify(A.traits, (_, v) => (typeof v === 'number' ? +v.toFixed(2) : v)),
    `HL ${f.species.HL.toFixed(3)} eye ${A.eye ? `${A.eye.s.toFixed(3)}/${A.eye.h.toFixed(2)} r${A.eye.r.toFixed(3)}` : '-'} nares ${A.nares.length} pores ${A.canals.length} rays ${A.rays.length} ${ms.toFixed(0)}ms`);
});
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, sheet.toBuffer('image/png'));
console.log('wrote', out);
